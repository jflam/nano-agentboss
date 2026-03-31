# 2026-03-31 Plan: Fix `/default` Multi-Turn History

## Goal

Make `/default` behave like a real conversation when native ACP session continuity is available.

Specifically:

1. first turn: `what is 2+2` -> `4`
2. second turn: `add 3 to result` -> `7`

If native continuity is unavailable, `/default` should start fresh rather than attempting transcript reconstruction.

This plan is intentionally scoped only to fixing `/default`.

---

## Non-goals

Do **not** solve these in this task:

- general history for all procedures
- structured reasoning over prior procedure results
- new `callAgent()` history APIs for arbitrary procedures
- nested tool trace improvements
- full `SessionStore` semantic memory design

Those can come later.

---

## Design

There is only one real way to continue `/default`:

1. resume the native ACP session

We should follow the same order agentboss uses for native continuation:

1. reuse live native session if it exists
2. otherwise attempt ACP `session/load`
3. otherwise start a fresh ACP session

This keeps native model/tool state and preserves caches when possible.

We should **not** attempt transcript reconstruction for `/default`.
That path is too complex and too unreliable for commands like `add 3 to result`, where correctness depends on genuine session continuity rather than text approximation.

---

## Scope

Only `/default` should change.

Today:

```ts
ctx.callAgent(prompt)
```

That is stateless.

After this change, `/default` should go through a dedicated continuation path for the current session.

Conceptually:

```ts
continueDefaultSession(sessionId, prompt)
```

---

## Required implementation

### 1. Persist ACP session identity per nanoboss session

Add session-level runtime state for the canonical `/default` loop:

- current ACP session id
- optionally live ACP client/connection if still active

This state should be associated with the nanoboss session, not with individual cell records.

### 2. Expose current `sessionId` to `/default`

Add the current session id to `CommandContext`.

Simplest shape:

```ts
readonly sessionId: string;
```

### 3. Add dedicated `/default` continuation helper

Implement a helper used only by `commands/default.ts`.

Behavior:

- if there is a live ACP session for this session id, use it
- else if there is a persisted ACP session id, attempt native `session/load`
- else create a fresh ACP session
- if native resume is unavailable or fails, create a fresh ACP session instead of reconstructing transcript history
- after success, persist the ACP session id again

### 4. Update `commands/default.ts`

Replace the one-shot `ctx.callAgent(prompt)` path with the dedicated continuation helper.

---

## Reference implementation in agentboss

Use these files as the model for native resume behavior:

- `~/agentboss/workspaces/agentboss/crates/agentboss-executor/src/runtime/orchestration.rs`
  - `resume_executor_session(...)`
- `~/agentboss/workspaces/agentboss/crates/agentboss-acp/src/session.rs`
  - `load_session(...)`
- `~/agentboss/workspaces/agentboss/crates/agentboss-acp/src/client.rs`
  - session resume/load helpers

We do **not** need all the executor/daemon complexity.
We only want the same native resume order:

1. live session
2. `session/load`
3. fresh session

---

## Tests

### Unit / integration

Add tests for:

1. first `/default` turn creates and persists ACP session id
2. second `/default` turn reuses or resumes the same session
3. if native resume is unavailable, `/default` starts a fresh ACP session rather than attempting transcript reconstruction

### Deterministic e2e

Using the mock agent:

1. `what is 2+2` -> `4`
2. `add 3 to result` -> `7`

Also add a case where the mock agent does not support native resume, and verify `/default` starts fresh instead of pretending continuity.

---

## Success criteria

This task is done when:

1. `/default` is conversational across turns when native ACP continuity is available
2. native ACP resume is used when possible
3. when native continuity is unavailable, `/default` starts fresh rather than using transcript reconstruction
4. `what is 2+2` followed by `add 3 to result` returns `7` when the same ACP session is reused or resumed
5. tests cover both native resume and fresh-session fallback behavior

---

## Suggested task list for a sub-agent

1. add `sessionId` to `CommandContext`
2. add per-session ACP runtime state
3. implement `/default` continuation helper
4. wire in native `session/load`
5. ensure failed resume/load falls back to a fresh ACP session
6. update `commands/default.ts`
7. add deterministic tests
