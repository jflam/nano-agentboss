> [!WARNING]
> ARCHIVED / SUPERSEDED — 2026-04-04
>
> This document reflects the removed session-MCP / `nanoboss-session` architecture or analysis tied to it.
>
> Current architecture:
> - single global MCP server: `nanoboss`
> - implementation: `src/mcp/server.ts`
> - entrypoint: `src/mcp/proxy.ts`
> - registration: `src/mcp/registration.ts`
> - overview: `docs/architecture.md`
>
> Do not use this archived plan as current implementation guidance.

# 2026-04-03 Post-unification simplification plan

## Context

As of the fixes through `e0c4df5`, nanoboss now has the important correctness properties we wanted from the top-level default session unification work:

- slash commands are routed through the persistent default/master session via `procedure_dispatch`
- token attribution for slash commands is based on the master session, not the hidden one-shot worker session
- nested tool visibility is restored through a procedure-dispatch progress sidechannel
- timeout recovery exists for long-running real Copilot MCP tool calls that time out even though the underlying procedure may still complete

That is good enough to validate correctness.

However, the implementation is still more complex than the target architecture needs. A lot of that complexity is transitional glue, timeout recovery glue, or duplicated lifecycle code.

This plan is specifically about simplifying that post-fix architecture aggressively without regressing the now-correct behavior.

---

## Goal

Reduce code size and conceptual complexity while preserving these invariants:

1. `/foo ...` executes semantically inside the one persistent master/default session.
2. Slash-command token footers reflect the master/default session, not nested worker sessions.
3. Nested tool visibility remains visible in the CLI while a dispatched procedure runs.
4. Long-running dispatched procedures can recover from Copilot MCP tool timeouts if the durable result lands in the session store.
5. Session refs/cells remain the durable source of truth.

---

## Current post-fix architecture

### Happy path

1. User types `/research ...`
2. `src/service.ts` routes slash commands into `dispatchProcedureIntoDefaultConversation(...)`
3. Default session gets an internal dispatch prompt
4. Downstream agent calls `procedure_dispatch`
5. `src/session-mcp.ts` executes the procedure, persists the cell, and returns structured refs/result
6. `src/service.ts` interprets that result as the top-level run completion

### Current recovery path

If the outer MCP tool call times out:

1. service detects the timeout failure
2. service polls the session store for a matching completed procedure cell
3. if found, service sends a hidden synchronization prompt into the default session so the master conversation still learns the result
4. service completes the top-level run from the recovered durable cell

### Current progress path

Because nested procedure updates do not naturally stream back through MCP tool responses:

1. `src/session-mcp.ts` writes sanitized nested updates to a progress JSONL file
2. `src/service.ts` polls that file and re-emits updates into the top-level run
3. CLI renders nested tool progress under the wrapper tool

This works, but it is not minimal.

---

## Main simplification opportunities

## 1. Extract one shared procedure-execution engine

### Problem

We still have duplicated procedure execution lifecycle code in at least two places:

- `src/service.ts`
  - default/non-slash direct execution branch
- `src/session-mcp.ts`
  - `procedureDispatch(...)`

Both of these perform variants of the same operations:

- create store/logger/emitter context
- start a top-level cell
- run the procedure
- finalize the cell
- derive returned refs/summary/display/data shape
- propagate token usage/default-agent selection changes

The current behavior is correct, but the control flow is larger than necessary and easy to let drift.

### Simplification target

Create one shared helper/module, something like:

- `src/procedure-runner.ts`
- or `executeTopLevelProcedure(...)`

That helper should own:

- logger span lifecycle
- top-level cell lifecycle
- `CommandContextImpl` construction
- finalized result shaping
- token usage capture
- default-agent-selection mutation capture

Then:

- `service.ts` uses it for direct default execution
- `session-mcp.ts` uses it for `procedure_dispatch`

### Acceptance criteria

- no duplicated top-level procedure lifecycle between `service.ts` and `session-mcp.ts`
- one canonical result shape for executed procedures
- one canonical place for default-agent-selection propagation and token usage extraction

---

## 2. Demote the hidden sync prompt to explicit timeout-recovery infrastructure

### Problem

The hidden sync prompt is no longer the primary slash-command path, which is good.

But the code still contains generic-looking sync machinery in `src/service.ts`:

- `buildProcedureSyncPrompt(...)`
- `syncProcedureResultIntoDefaultConversation(...)`

After the routing change, those are now recovery-only behavior, not the normal model.

### Simplification target

Make that explicit by renaming and isolating it, e.g.:

- `buildRecoveredProcedureSyncPrompt(...)`
- `syncRecoveredProcedureResultIntoDefaultConversation(...)`

Move it into a narrow recovery-oriented helper/module, such as:

- `src/procedure-dispatch-recovery.ts`

### Why this matters

Right now the code still visually suggests that hidden sync is a normal part of slash-command semantics. It is not. It is now only a timeout fallback.

### Acceptance criteria

- hidden sync prompt code is clearly marked recovery-only
- no primary slash-command path calls a generic sync helper
- successful `procedure_dispatch` completions do not use hidden sync at all

---

## 3. Remove always-on legacy session-tool guidance from normal default turns

### Problem

`prepareDefaultPrompt(...)` still injects `renderSessionToolGuidance()` too eagerly.

The current logic uses:

- presence of unsynced cards
- or historical existence of any non-default top-level procedure

That means the old memory/retrieval guidance can stick around long after the new in-session dispatch path has already made it unnecessary.

This increases prompt size and preserves legacy mental models.

### Simplification target

Only inject guidance when there is an actual recovery/resync reason, for example:

- unsynced cards exist
- recovery fallback happened recently
- or explicit retrieval mode is needed

Do **not** inject guidance simply because there was once a slash command in the session.

### Acceptance criteria

- a successfully dispatched slash command does not permanently cause later default prompts to carry retrieval guidance
- guidance appears only for real fallback/recovery scenarios
- prompt diagnostics show reduced steady-state overhead after slash commands

---

## 4. Consolidate MCP JSON-RPC dispatch surface

### Problem

`src/mcp-proxy.ts` and `src/session-mcp.ts` still have overlapping MCP dispatch behavior and wrapper logic.

The metadata drift problem already appeared earlier and can reappear.

### Simplification target

Create one shared MCP JSON-RPC dispatch helper for:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`
- result formatting

Then make `mcp-proxy.ts`, `session-mcp-stdio.ts`, and `session-mcp-http.ts` thin transport wrappers.

### Acceptance criteria

- one canonical implementation for MCP method dispatch and tool result formatting
- transport files become small wrappers only
- no stale duplicate initialize/instructions metadata

---

## 5. Make an explicit keep/remove decision on session MCP HTTP

### Problem

The repo still has both:

- stdio session MCP attachment as the active runtime path
- HTTP session MCP implementation plus tests

The architecture docs also still mention HTTP in places where stdio is the real path.

This may be useful, but it is also a clear simplification candidate.

### Decision point

Pick one of these explicitly:

#### Option A: stdio is the only supported attachment path
Then:

- remove `src/session-mcp-http.ts`
- remove its tests
- remove attachment/disposal helpers only needed for HTTP
- update docs to say stdio-only

#### Option B: HTTP remains intentionally supported
Then:

- document why
- state where it is used
- ensure transport-independent logic is shared so HTTP is not a second semi-dead implementation

### Recommendation

Unless there is a real near-term consumer for HTTP session-MCP attachment, prefer **Option A** and delete it.

### Acceptance criteria

- no ambiguous “implemented but not used” transport remains without a documented reason
- docs match runtime

---

## 6. Isolate and clean up procedure-dispatch progress sidechannel code

### Problem

The progress bridge currently spans multiple concerns:

- session-MCP execution emits progress records
- service polls progress files
- CLI wrapper heuristics know how to display dispatched procedures as wrappers

This is correct but somewhat ad hoc.

### Simplification target

Extract all progress-sidechannel concerns into one focused module, e.g.:

- `src/procedure-dispatch-progress.ts`

That module should own:

- progress file path calculation
- sanitization of forwarded updates
- progress file write behavior
- progress file tail/poll bridge
- cleanup policy

### Extra cleanup target

Ensure progress files are cleaned up after completion, or at least bounded and ignorable.

### Acceptance criteria

- service/session-MCP do not each contain partial progress-sidechannel logic inline
- progress bridge code is centralized and easier to reason about
- progress files do not accumulate indefinitely without intent

---

## 7. Tighten timeout recovery matching logic

### Problem

Timeout recovery currently finds a matching durable cell by heuristics such as:

- procedure name
- prompt text
- creation time window

This is pragmatic, but still looser than ideal.

### Simplification target

Prefer a stronger correlation key, e.g. include a dispatch correlation ID in:

- the `procedure_dispatch` tool input
- the persisted procedure cell metadata
- the timeout recovery lookup

That would allow:

- simpler recovery matching
- less timestamp/prompt heuristic logic
- less risk of ambiguous recovery in repeated commands

### Acceptance criteria

- timeout recovery no longer depends primarily on prompt-text/time-window heuristics
- one dispatched procedure maps to one durable recovery identity

---

## 8. Keep one source of truth for top-level run completion shape

### Problem

The top-level run completion event currently merges data from several possible sources:

- direct default-session result
- `procedure_dispatch` structured result
- recovered durable cell after timeout

This is necessary, but can still drift if each path manually assembles run-completion fields.

### Simplification target

Create one helper that builds the final `run_completed` payload from:

- procedure name
- canonical cell/result info
- token usage

This will reduce branching and make the top-level event model less fragile.

### Acceptance criteria

- no duplicated `run_completed` shaping logic across dispatch/direct/recovery paths
- same fields populated consistently regardless of completion path

---

## 9. Add one opt-in real-agent regression test for the exact failure class we hit

### Problem

Our unit coverage caught correctness of the new architecture, but it did **not** catch the real Copilot MCP timeout behavior.

### Simplification target

Add one opt-in real-agent regression scenario that exercises:

- long-running `/research`
- true `procedure_dispatch`
- real downstream MCP timeout behavior if it occurs
- recovery from durable session result
- token attribution still reflecting master session
- nested tool visibility under `procedure_dispatch`

This does not reduce code directly, but it makes later deletion/refactoring much safer.

### Acceptance criteria

- one documented opt-in e2e test exists for the exact class of regression we saw in production use

---

## Recommended implementation order

### Phase 1: remove conceptual leftovers from the old pathway
1. Make sync prompt code recovery-only by name and module placement
2. Reduce always-on session-tool guidance in normal default turns
3. Centralize final run completion shaping

### Phase 2: reduce structural duplication
4. Extract shared top-level procedure runner
5. Consolidate MCP dispatch/formatting wrappers
6. Extract progress-sidechannel module

### Phase 3: delete or justify extra transport/code paths
7. Decide stdio-only vs HTTP session-MCP
8. Remove dead transport if not needed

### Phase 4: strengthen recovery correctness
9. Add explicit dispatch correlation IDs
10. Add opt-in real-agent regression scenario

---

## Deletion candidates once the above lands

These are the most likely pieces to shrink or remove:

- inline recovery-specific sync code from `src/service.ts`
- always-on legacy guidance injection from normal default turns
- duplicated top-level procedure execution logic in `src/service.ts` and `src/session-mcp.ts`
- duplicated MCP dispatch/result formatting code
- possibly `src/session-mcp-http.ts` and related tests/helpers if stdio-only is chosen
- scattered progress-sidechannel logic once centralized

---

## Non-goals

This plan is **not** about changing user-facing semantics again.

It is specifically **not** trying to:

- revert `procedure_dispatch`
- revert master-session token attribution fixes
- remove timeout recovery before a better equivalent exists
- remove nested tool visibility restoration

Those are now correctness features and should be preserved.

---

## Review checklist for the simplification work

When reviewing the follow-up simplification PRs, ask:

1. Does slash-command execution still go through `procedure_dispatch` on the happy path?
2. Does a long-running `/research` still recover if Copilot times out the MCP tool call?
3. Do token footers still reflect the master/default session?
4. Do nested tool calls under a dispatched procedure still appear in the CLI?
5. Has any legacy prompt-injection guidance been removed from the steady state?
6. Did total lines of code actually go down?
7. Did transport duplication actually shrink, or just move around?

If the answer to (6) is not clearly yes, the simplification work probably is not done yet.
