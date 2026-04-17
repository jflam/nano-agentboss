# `@nanoboss/agent-acp` `callAgent()` removal and ACP provenance fix plan

## Why this plan exists

The current package surface has an unstable split:

- `invokeAgent()` is the real downstream ACP transport primitive
- exported `callAgent()` is a detached convenience wrapper that persists a synthetic run into a brand-new `SessionStore`

That detached helper is not used by production code in this repo. Meanwhile, the real provenance path for `ctx.agent.run(...)` currently drops the full structured ACP updates array when it stores the child `callAgent` run.

That combination creates two problems:

1. an unused public helper with semantics that do not match NanoBoss session provenance
2. incomplete provenance on the real child agent runs that users and agents should be able to inspect later

## Goals

1. remove the standalone exported `callAgent()` helper from `@nanoboss/agent-acp`
2. preserve the full ACP updates array on real stored child agent runs created by `ctx.agent.run(...)`
3. keep existing parent lineage behavior for child agent runs in the current NanoBoss session graph
4. avoid conflating ACP session updates with existing top-level `replayEvents`
5. leave naming cleaner than it is now, without introducing a second semantic blur

## Non-goals

- changing the high-level runtime semantics of `/default`
- changing how top-level persisted runtime/frontend replay works
- redesigning the entire stored run schema beyond what is needed for durable ACP provenance
- renaming public APIs unless the semantics are fully clear after `callAgent()` is removed

## Current state

### `ctx.agent.run(...)`

`ctx.agent.run(...)` in `procedure-engine` does **not** call exported `@nanoboss/agent-acp` `callAgent()`.

It:

- calls `invokeAgent(...)`
- creates a child run in the caller's existing `SessionStore`
- attaches that child run to the current parent run via `parentRunId`

That means lineage is already mostly correct for real NanoBoss usage.

Relevant code:

- `procedures/default.ts`
- `packages/procedure-engine/src/context/agent-api.ts`
- `packages/procedure-engine/src/context/session-api.ts`

### exported `@nanoboss/agent-acp` `callAgent()`

The standalone helper:

- calls `invokeAgent(...)`
- creates a fresh `SessionStore` with a random session id
- writes a detached `callAgent` run there
- returns a `RunResult`-shaped object

This is not the provenance model NanoBoss wants for real session-associated agent calls.

Relevant code:

- `packages/agent-acp/src/transport.ts`
- `packages/agent-acp/src/index.ts`

### provenance gap

The store already supports durable `replayEvents` on run output, but the child `callAgent` persistence path in `procedure-engine` does not currently store the ACP `updates` array anywhere durable on the child run.

Top-level runs separately receive persisted runtime replay events later in `app-runtime`. That mechanism is not a substitute for storing exact ACP updates on the child agent run itself.

Relevant code:

- `packages/store/src/session-store.ts`
- `packages/procedure-engine/src/context/agent-api.ts`
- `packages/app-runtime/src/service.ts`

## Proposed implementation

### 1. Remove exported `callAgent()` from `@nanoboss/agent-acp`

Delete:

- `callAgent()` implementation from `packages/agent-acp/src/transport.ts`
- `callAgent` export from `packages/agent-acp/src/index.ts`

Then:

- remove any no-longer-needed imports and types
- update package docs to describe `invokeAgent()` as the transport-level helper and `createAgentSession()` as the persistent-session helper
- update or rewrite tests that currently exercise `callAgent()`

Expected impact:

- eliminates the detached synthetic-store helper before production code starts depending on it
- removes the misleading “callAgent means persisted agent call” implication from the ACP package

### 2. Persist the full ACP updates array on real child agent runs

Extend the stored run output shape with a dedicated field for exact ACP session updates.

Recommended field name:

- `agentUpdates`

Alternative acceptable names:

- `acpUpdates`
- `sessionUpdates`

Recommendation:

- prefer `agentUpdates` because the stored run is semantically “downstream agent provenance”, even if ACP is the current transport

Why not use `replayEvents`:

- `replayEvents` already means persisted NanoBoss runtime/frontend replay
- ACP session updates are raw downstream protocol artifacts
- mixing them would make restoration and provenance semantics harder to reason about

Required changes:

- update the stored run record contract to include the new field
- update `SessionStore.completeRun(...)` to accept and persist it
- thread `params.updates` from `AgentRunRecorder.complete(...)` into that new stored field
- ensure the public read path exposes the field on `RunRecord`

Expected outcome:

- every real `ctx.agent.run(...)` child run durably carries the exact structured downstream ACP update array that produced the final result

### 3. Preserve and verify parent lineage behavior

Do not rewrite the existing lineage model unless a bug is discovered.

Today, `AgentRunRecorder.begin(...)` already creates child runs with:

- `procedure: "callAgent"`
- `kind: "agent"`
- `parentRunId` equal to the current run id

That is the correct basic shape for “this agent call happened as part of this top-level session/procedure execution”.

The implementation task here is verification, not redesign:

- add or improve tests that prove `/default` and nested procedure calls produce descendant `callAgent` runs in the same session graph
- assert that those child runs are queryable through the session store
- assert that the stored child run now also contains the full ACP updates array

### 4. Decide what additional child-run provenance should be stored

While threading the updates array through, decide whether the child run should also durably persist:

- `agentSessionId`
- `logFile`
- `tokenSnapshot`

Recommendation:

- store `agentSessionId` on the child run output or metadata if available
- strongly consider storing `tokenSnapshot` because it is already provenance about the child call
- `logFile` is less critical because it is diagnostic and path-shaped, but it may still be useful

This does not need to block the ACP updates fix if schema churn starts getting too large. The required fix is the exact updates array.

### 5. Revisit naming only after semantics are clean

Question:

- should `invokeAgent()` be renamed to `callAgent()` after removing the old helper?

Recommendation for this change:

- do **not** rename it yet

Reason:

- `invokeAgent()` is currently accurate as a transport primitive
- the name `callAgent()` previously referred to a persistence-bearing convenience wrapper
- reusing the name immediately risks another semantic mismatch before the public surface settles

Possible follow-up after this change lands:

- keep `invokeAgent()` permanently if the package remains transport-oriented
- only introduce a future `callAgent()` API if it means “recorded agent call in an existing NanoBoss provenance/session context”, which likely belongs above `agent-acp`

## File targets

Expected primary files:

- `packages/agent-acp/src/transport.ts`
- `packages/agent-acp/src/index.ts`
- `packages/procedure-engine/src/context/agent-api.ts`
- `packages/store/src/session-store.ts`
- `packages/contracts/src/index.ts`
- `packages/procedure-sdk/src/index.ts`
- `docs/agent-acp-package.md`

Likely test files:

- `packages/agent-acp/tests/agent-acp-package.test.ts`
- `packages/app-runtime/tests/call-agent-parse.test.ts`
- `tests/unit/context-call-agent-session.test.ts`
- `tests/unit/service.test.ts`
- any additional package-local store or app-runtime tests needed to validate durable inspection of child runs

## Testing plan

### Required regression coverage

1. `ctx.agent.run(...)` stores a child `callAgent` run in the same NanoBoss session graph.

2. The child run is a descendant of the invoking top-level or procedure run.

3. The stored child run contains the full ACP updates array, not only `raw`/`stream`.

4. `/default` turns still reuse the default downstream `AgentSession` as before.

5. Session restoration behavior for top-level runs is unaffected.

6. No remaining production code imports exported `@nanoboss/agent-acp` `callAgent()`.

### Validation commands

- `bun test packages/agent-acp/tests`
- `bun test packages/app-runtime/tests/call-agent-parse.test.ts`
- `bun test tests/unit/context-call-agent-session.test.ts`
- targeted `tests/unit/service.test.ts` coverage for nested child-run provenance
- `bun run --cwd packages/agent-acp typecheck`
- `bun run --cwd packages/procedure-sdk typecheck`
- `bun run --cwd packages/procedure-engine typecheck`
- `bun run --cwd packages/app-runtime typecheck`

## Acceptance criteria

This work is complete when:

1. exported `@nanoboss/agent-acp` `callAgent()` no longer exists
2. production code still uses `invokeAgent()` or persistent `AgentSession` paths successfully
3. real child `callAgent` runs created by `ctx.agent.run(...)` retain parent lineage within the calling NanoBoss session
4. those child runs durably preserve the full structured ACP updates array
5. tests demonstrate that an agent or user inspecting prior runs can recover that downstream provenance from the stored run graph
6. docs reflect the cleaned-up contract and no longer describe detached synthetic-run persistence as part of the ACP package surface

## Open questions for the implementing agent

1. What exact schema field name should hold the durable ACP updates array: `agentUpdates`, `acpUpdates`, or `sessionUpdates`?

2. Should `agentSessionId` and `tokenSnapshot` be added in the same schema change, or staged as a follow-up?

3. Does any external consumer depend on exported `callAgent()` despite there being no in-repo production usages?

4. Should `invokeAgent()` remain public as-is, or should a later cleanup narrow the public ACP package surface further?
