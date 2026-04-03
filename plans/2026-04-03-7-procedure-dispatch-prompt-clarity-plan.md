# 2026-04-03 Procedure-dispatch prompt clarity plan

## Goal

Reduce the amount of pre-dispatch “tool discovery” reasoning the downstream agent does before starting a slash-command procedure.

The target behavior is:

1. user invokes `/research ...` or another procedure
2. the downstream agent immediately recognizes that the correct session MCP server is already attached
3. it calls the dispatch tool chain right away
4. it does not spend turns searching the repo, inferring session ids, or explaining MCP plumbing

## Live validation results (2026-04-03)

I validated the async slash-dispatch path against the real downstream agents by running a simple slash command (`/model`) through the HTTP server and inspecting frontend events / agent behavior.

### First validation pass

- **Claude**: pass via attached `nanoboss-session`
- **Gemini**: pass via attached `nanoboss-session`
- **Codex**: pass via attached `nanoboss-session`
- **Copilot**: fail
  - Copilot did not expose the attached-session dispatch tools to the conversation toolset reliably enough for the current prompt shape.

### Fix applied after the first pass

1. restored `nanoboss doctor --register`
2. restored a working global `nanoboss mcp proxy` stdio server
3. updated registration so all four agents receive a valid global `nanoboss` MCP config
4. updated dispatch prompting so the agent can use either:
   - attached `nanoboss-session` tools when available
   - or globally registered `nanoboss` tools when that is the surfaced path
5. removed the legacy `procedure_dispatch` compatibility tool after cross-provider validation passed

### Final validation pass

- **Claude**: pass
  - used the async start/wait path successfully via attached namespaced handles such as `mcp__nanoboss-session__procedure_dispatch_start`
- **Gemini**: pass
  - used the async start/wait path successfully via `procedure_dispatch_start (nanoboss-session MCP Server)` / `procedure_dispatch_wait (nanoboss-session MCP Server)`
- **Codex**: pass
  - used the async start/wait path successfully via `Tool: nanoboss-session/procedure_dispatch_start` / `Tool: nanoboss-session/procedure_dispatch_wait`
- **Copilot**: pass
  - used the async start/wait path successfully via globally registered `nanoboss-procedure_dispatch_start` / `nanoboss-procedure_dispatch_wait`

### What this means

1. The problem was **not** MCP-level async capability.
2. The real issue was **provider-specific MCP surfacing**:
   - attached session MCP works for Claude, Gemini, and Codex
   - Copilot needed a valid global `nanoboss` MCP registration path
3. Prompt wording must support both:
   - attached `nanoboss-session` handles
   - global `nanoboss` handles
4. After that compatibility layer was in place, the repo could safely remove the legacy one-shot `procedure_dispatch` tool.

## Decision from this validation

- `nanoboss doctor --register` should exist and register a working global `nanoboss` MCP server for all four supported agents.
- Slash-dispatch prompting should support whichever valid nanoboss MCP surface the provider exposes.
- The legacy `procedure_dispatch` compatibility tool can be removed once cross-provider validation passes.
- That validation now passes for Claude + Gemini + Codex + Copilot.

## Observed problem

Current real-world behavior includes messages like:

- “the tool itself is not exposed directly in this chat's tool list”
- “I’m checking how this workspace invokes it”
- “I’m reading that path before I fire the dispatch”
- “the stdio server requires an explicit --session-id”
- “I found the active session id”

That is exactly the kind of confusion we want to eliminate.

## Root-cause hypotheses

### 1. The control prompt is correct but not sufficiently constraining

`src/service.ts` now builds a dispatch prompt that says:

- call `procedure_dispatch_start` exactly once
- poll `procedure_dispatch_wait`
- use whichever valid nanoboss MCP surface the provider exposes

That is directionally right, but it does **not** say the most important thing strongly enough:

- the correct session MCP server is **already attached**
- the agent should **not inspect the repo, CLI, session files, or current-session pointer**
- if the client surfaces MCP tools with a server prefix / namespace, it should use that exposed variant rather than assuming the tool is unavailable

Because that is left implicit, the model starts exploring implementation details instead of dispatching immediately.

### 2. Session MCP server instructions are too generic

`src/session-mcp.ts` exports:

- `SESSION_MCP_INSTRUCTIONS`

The current text is very broad: it says these tools dispatch procedures and inspect durable session state, but it does not explicitly teach the anti-confusion rules:

- this server is already pinned to the current nanoboss session
- you do not need to discover or pass `sessionId`
- do not inspect repo code or `~/.nanoboss` to figure out how to call these tools
- the intended slash-dispatch workflow is start -> wait

### 3. Tool descriptions do not strongly encode the workflow

The MCP tool descriptions in `src/session-mcp.ts` are accurate, but still too descriptive and not directive enough.

In particular:

- `procedure_dispatch_start` should clearly read as the **first step**
- `procedure_dispatch_wait` should clearly read as the **second/repeated step**
- dispatch tools should explicitly say they already operate on the attached session
- dispatch tools should explicitly say the client may expose them under **namespaced / server-prefixed handles**

Today the agent still has to infer the flow.

### 4. Tool result text does not coach the next action

`serializeToolResult()` / `serializeProcedureDispatchStatus()` in `src/session-mcp.ts` currently emit neutral status text like:

- `research running. dispatchId=...`

That is machine-readable enough, but it does not help the model snap to the next correct action.

A better text surface would say things like:

- dispatch started; next call `procedure_dispatch_wait` with this dispatch id
- still running; call `procedure_dispatch_wait` again
- completed; return this exact result text

The structured payload can stay the source of truth; the text can act as routing guidance.

### 5. Some surrounding language still keeps fallback mental models alive

A few nearby surfaces still mention alternate access paths in ways that increase search space:

- `src/server.ts` mentions “attached session MCP server and matching slash commands”
- `src/memory-cards.ts` teaches both MCP and slash-host inspection paths
- `src/session-tool-procedures.ts` duplicates some inspection capabilities as slash commands

Those may be fine for human users, but they are not ideal wording when the goal is to make the agent choose the attached MCP path instantly.

## Proposed fix plan

## Phase 1: tighten the internal dispatch prompt

### File

- `src/service.ts`

### Change

Rewrite `buildProcedureDispatchPrompt()` so it is shorter, more imperative, and removes ambiguity.

### Required prompt properties

The new prompt should explicitly say:

- this is an internal control message
- the correct nanoboss session MCP server is **already attached to this conversation**
- do **not** inspect repository files, CLI code, MCP wiring, session pointer files, or `~/.nanoboss`
- do **not** try to discover a session id
- if the client shows server-prefixed / namespaced tool names, use the attached server’s exposed variant of `procedure_dispatch_start` and `procedure_dispatch_wait`
- step 1: call start once with the provided JSON
- step 2: repeatedly call wait until terminal status
- when completed, output only the final tool result text
- when failed, output only the error text
- no prefatory explanation

### Why

This directly addresses the exact confusion we observed: the model should stop treating dispatch as something it has to rediscover from repo code.

## Phase 2: strengthen session MCP initialize instructions

### File

- `src/session-mcp.ts`

### Change

Make `SESSION_MCP_INSTRUCTIONS` much more explicit and workflow-oriented.

### New instruction content should encode

- this MCP server is already attached to the current master/session context
- no session-id lookup is needed
- do not inspect files or invoke nanoboss CLI to figure out usage
- for slash dispatch, first call `procedure_dispatch_start`, then `procedure_dispatch_wait` until terminal status
- use the exact tool handles exposed by the client for this attached server

### Why

Some providers lean heavily on MCP `initialize.instructions` when deciding whether tools are immediately usable. Right now that field is too generic to prevent wandering.

## Phase 3: rewrite dispatch tool descriptions to be procedural, not merely descriptive

### File

- `src/session-mcp.ts`

### Change

Rewrite the descriptions for:

- `procedure_dispatch_start`
- `procedure_dispatch_wait`
- `procedure_dispatch_status`

### Desired description shape

#### `procedure_dispatch_start`
Should say, in effect:

- first step for slash-command dispatch
- already scoped to the attached current session
- returns quickly with `dispatchId`
- call `procedure_dispatch_wait` next

#### `procedure_dispatch_wait`
Should say, in effect:

- second/repeated step after start
- use same `dispatchId`
- short bounded wait
- returns latest status or final result

#### `procedure_dispatch_status`
Should say, in effect:

- use when you need a non-blocking status check
- not the primary happy-path if you are already in the start/wait loop
- if the provider/tool picker surfaces namespaced handles, use that surfaced handle rather than assuming the tool is missing

### Why

This reduces model search-space inside the tool picker itself.

## Phase 4: make tool result text explicitly coach the next step

### File

- `src/session-mcp.ts`

### Change

Update textual serialization in:

- `serializeToolResult()`
- `serializeProcedureDispatchStatus()`

while keeping `structuredContent` stable.

### Desired behavior

#### Start result text
Instead of a bare “Dispatch queued: ...”, emit something closer to:

- dispatch started
- here is the dispatch id
- next call `procedure_dispatch_wait` with that id

#### Running / queued wait result text
Instead of only “research running. dispatchId=...”, emit something closer to:

- still running
- call `procedure_dispatch_wait` again with the same dispatch id

#### Completed result text
Keep returning the final result text cleanly so the caller can echo it verbatim.

#### Failed result text
Keep returning the error text cleanly so the caller can echo it verbatim.

### Why

This gives the model a useful textual steering rail without changing the structured contract.

## Phase 5: de-emphasize alternate discovery paths in agent-facing wording

### Files

- `src/server.ts`
- `src/memory-cards.ts`
- `src/session-tool-procedures.ts`

### Change

Audit agent-facing wording and reduce unnecessary references to alternate lookup mechanisms when the attached session MCP is the preferred path.

### Likely scope

- keep human-facing slash inspection commands if they are still useful
- but make MCP the clearly primary path in wording
- remove language that suggests the model should compare command surfaces before acting

### Why

We want the default model instinct to be: “the attached MCP server is authoritative and ready now.”

## Phase 6: add regression tests for prompt clarity and routing guidance

### Files

- `tests/unit/service.test.ts`
- `tests/unit/default-memory-bridge.test.ts`
- `tests/unit/session-mcp-format.test.ts`
- `tests/unit/session-mcp.test.ts`

### Add tests for

1. dispatch prompt contains “already attached” / “do not inspect repo or session files” guidance
2. dispatch prompt forbids session-id discovery language
3. session MCP initialize instructions mention attached-session semantics and start->wait flow
4. `procedure_dispatch_start` tool description says it is the first step
5. `procedure_dispatch_wait` tool description says it is the repeated follow-up step
6. dispatch tool text results include explicit next-step guidance for queued/running states
7. completed tool text stays clean and directly returnable

### Why

The bug is largely prompt-and-wording driven, so we need tests that lock in the intended wording.

## Acceptance criteria

A fix is successful when all of the following are true:

1. In real `/research` / `/review` runs, the downstream agent starts with the dispatch MCP path immediately instead of spelunking the repo.
2. The agent no longer talks about needing to discover session ids, pointer files, or stdio invocation details.
3. The first significant action after the internal dispatch prompt is a call to `procedure_dispatch_start` (or the namespaced equivalent exposed by the client).
4. The prompt and MCP metadata make it obvious that the attached session MCP server is already the authoritative surface.
5. Cross-provider validation passes for Claude, Gemini, Codex, and Copilot on the async start/wait path.
6. Structured MCP results remain backward-compatible.
7. Existing async dispatch / recovery behavior remains unchanged apart from reduced confusion and less preamble chatter.

## Non-goals

This plan does **not** require:

- changing the async dispatch architecture
- changing durable session storage
- removing session inspection tools
- removing slash inspection commands entirely
- changing procedure semantics

This is primarily a prompt/metadata/result-text clarity pass.

## Validation plan

1. Run a real slash command like `/model` or `/research ...` against each downstream provider: Claude, Gemini, Codex, Copilot.
2. Inspect the first assistant output and tool activity.
3. Confirm there is no repo/MCP/session-id archaeology before the first dispatch tool call.
4. Confirm the visible tool chain is start -> wait -> final result, allowing for provider-specific namespaced tool titles.
5. Repeat with at least one longer-running procedure to ensure the wording still works under polling.
6. After all four providers passed, the legacy `procedure_dispatch` compatibility path was removed.

## Implementation order

1. `src/service.ts` prompt rewrite
2. `src/session-mcp.ts` initialize instructions + tool descriptions
3. `src/session-mcp.ts` textual result serialization improvements
4. wording cleanup in nearby agent-facing surfaces
5. unit tests
6. manual validation with real providers

## Expected payoff

This should not change correctness, but it should materially improve perceived responsiveness:

- less “thinking out loud” about MCP plumbing
- faster first tool call
- fewer wasted tokens on self-inflicted discovery
- lower chance that the model chooses filesystem or repo inspection instead of the attached tool surface
