# 2026-04-04 pi-mono tool call output research for nanoboss

## Goal

Research how `~/src/pi-mono` implements tool call output in its `pi-tui` interactive UI, compare that to current nanoboss behavior, and spell out the closest practical alignment path given that nanoboss receives ACP-shaped tool updates instead of pi agent-core messages.

---

## Files inspected

### pi-mono

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- `packages/coding-agent/src/modes/interactive/theme/theme.ts`
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/core/tools/index.ts`
- `packages/coding-agent/src/core/tools/render-utils.ts`
- `packages/coding-agent/src/core/tools/bash.ts`
- `packages/coding-agent/src/core/tools/read.ts`
- `packages/coding-agent/src/core/tools/edit.ts`
- `packages/coding-agent/src/core/tools/write.ts`
- `packages/coding-agent/src/core/tools/find.ts`
- `packages/coding-agent/src/core/tools/grep.ts`
- `packages/coding-agent/src/core/tools/ls.ts`
- `packages/coding-agent/src/modes/interactive/components/diff.ts`
- `packages/coding-agent/README.md`

### nanoboss

- `src/http/frontend-events.ts`
- `src/core/tool-call-preview.ts`
- `src/procedure/dispatch-progress.ts`
- `src/tui/state.ts`
- `src/tui/reducer.ts`
- `src/tui/views.ts`
- `src/tui/components/tool-card.ts`
- `src/tui/components/tool-card-format.ts`
- `src/tui/theme.ts`
- `src/tui/app.ts`
- `tests/unit/frontend-events.test.ts`
- `tests/unit/tui-reducer.test.ts`
- `plans/2026-04-03-acp-tool-call-cards-alignment-plan.md`

---

## Executive summary

Nanoboss is already much closer to pi-mono than it was a day ago:

- tool calls are now retained transcript items
- tool cards persist after run completion
- wrapper suppression / branch collapsing exists
- ACP payloads are summarized into compact card-safe previews

But pi-mono still has a meaningfully richer implementation.

The biggest differences are:

1. **pi-mono renders tools through a true renderer pipeline** (`renderCall` / `renderResult`) rather than through generic string summaries.
2. **pi-mono shows real card bodies with background state** (pending/success/error), not just bordered summary boxes.
3. **pi-mono keeps multi-line, tool-specific output previews** with collapse/expand behavior (`Ctrl+O`).
4. **pi-mono gives first-class rendering to known tools** like `bash`, `read`, `edit`, `write`, `grep`, `find`, and `ls`.
5. **pi-mono streams partial tool output in-place**, especially for `bash`, and supports richer result content like diffs, syntax-highlighted snippets, warnings, elapsed time, and images.

The closest practical match for nanoboss is **not** to copy pi-mono internals directly. The right move is to copy its structure:

- a generic tool card shell
- a tool renderer registry
- richer bounded preview payloads
- global expand/collapse for tool bodies
- per-tool formatting for the common built-ins

Because nanoboss gets ACP `tool_call` / `tool_call_update` events instead of pi agent-core `toolCall` + `toolResult` messages, exact parity is not possible. But the UI can get **visibly very close**.

---

## How pi-mono actually works

## 1. Tool calls are rendered as standalone transcript components

In pi-mono interactive mode, assistant text and tool executions are separate transcript components.

Relevant code:

- `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`

The important behavior is:

- assistant text/thinking is rendered by `AssistantMessageComponent`
- tool calls from assistant content become separate `ToolExecutionComponent`s
- those components are inserted directly into the chat container
- they update in place over time
- on replay/resume, pi-mono reconstructs the same view by replaying assistant `toolCall` blocks and matching `toolResult` messages

So the transcript model is effectively:

- assistant prose block
- tool card(s)
- later assistant prose block

That is the same high-level shape nanoboss should keep.

---

## 2. pi-mono uses two event sources for one tool row

In live interactive rendering, pi-mono uses both:

- assistant `message_update` content containing `toolCall` blocks
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end` lifecycle events

From `interactive-mode.ts`:

- during `message_update`, pi-mono notices `toolCall` content and creates or updates a pending `ToolExecutionComponent`
- on `message_end`, it marks args complete
- on `tool_execution_start`, it marks execution started
- on `tool_execution_update`, it updates partial result content in place
- on `tool_execution_end`, it finalizes the card and removes it from the pending map

This is a subtle but important detail:

- **assistant message content owns tool identity and arguments**
- **tool execution events own runtime lifecycle and result streaming**

Nanoboss does not have the same split, but ACP `tool_call` + `tool_call_update` is enough to approximate it.

---

## 3. The core visual primitive is `ToolExecutionComponent`

The heart of pi-mono tool rendering is:

- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`

This component:

- stores tool name, toolCallId, args, partial/final result, expanded state, renderer state, and image state
- chooses a background based on tool status:
  - pending -> `toolPendingBg`
  - success -> `toolSuccessBg`
  - error -> `toolErrorBg`
- renders into a `Box` when a renderer definition exists
- falls back to a plain text rendering when no tool definition exists

This is the core architecture nanoboss should emulate.

### What the component does well

- stable identity per tool call
- in-place updates
- status-colored background
- renderer reuse with `lastComponent`
- shared per-card renderer state
- optional image rendering
- graceful fallback when no custom renderer exists

Nanoboss currently has only the last piece of this in a lightweight way.

---

## 4. pi-mono has a real tool renderer API

The key abstraction is in:

- `packages/coding-agent/src/core/extensions/types.ts`

Tool definitions can implement:

- `renderCall(args, theme, context)`
- `renderResult(result, options, theme, context)`

The render context includes things nanoboss does not yet model:

- `toolCallId`
- `lastComponent`
- shared renderer `state`
- `executionStarted`
- `argsComplete`
- `isPartial`
- `expanded`
- `showImages`
- `isError`

That gives pi-mono enough context to build polished per-tool output without hard-coding tool UI into interactive mode.

This separation is probably the single most important design choice to copy.

---

## 5. pi-mono tool output is tool-specific, not generic

pi-mono does not format all tools as:

- title
- input summary
- output summary

Instead, built-ins each have custom `renderCall` / `renderResult` behavior.

### `bash`

From `packages/coding-agent/src/core/tools/bash.ts`:

- call header is rendered as `$ <command>`
- partial output streams in place
- collapsed preview shows a bounded subset of lines
- expanded mode shows full retained preview
- elapsed time is shown while running and completion duration after finish
- truncation/full-output-path warnings are surfaced in the card
- errors still render inside the same tool card

This is much richer than nanoboss's current single-line `outputSummary`.

### `read`

From `packages/coding-agent/src/core/tools/read.ts`:

- call header is `read <path>` with optional line range suffix
- result preview is multi-line
- code is syntax highlighted when possible
- collapsed mode shows first 10 lines
- truncation notices are explicit and actionable
- image reads are supported through text + image content blocks

Nanoboss currently compresses all of this to a one-line summary.

### `edit`

From `packages/coding-agent/src/core/tools/edit.ts` and `components/diff.ts`:

- call header is `edit <path>`
- success result renders a colored unified diff
- errors render inline in the card

This is a major UX win and worth copying in spirit.

### `write`

From `packages/coding-agent/src/core/tools/write.ts`:

- call card includes the file contents being written
- syntax highlighting is applied when possible
- collapsed mode shows first 10 lines
- errors render as result content

This means the *input* is the interesting part of the card, not the result.

### `find`, `grep`, `ls`

From their tool files:

- headers show normalized query/path info
- results are multi-line lists
- collapsed previews cap visible lines
- truncation warnings are explicit

Again, pi-mono favors a small, useful preview over a single sentence summary.

---

## 6. Expansion is global and built into the UX

pi-mono exposes:

- `Ctrl+O` to collapse/expand tool output

Relevant code:

- `interactive-mode.ts`
- `README.md`

This expansion flag is global. It iterates through current tool components and toggles `setExpanded(expanded)`.

That matters because pi-mono’s default card bodies are usually:

- informative but collapsed
- multi-line when expanded

Nanoboss currently has no equivalent. All previews are already collapsed to a single summary string, so there is nothing to expand.

---

## 7. Theme is doing real work

In pi-mono theme definitions:

- `toolPendingBg`
- `toolSuccessBg`
- `toolErrorBg`
- `toolTitle`
- `toolOutput`
- diff colors

The tool card shell is visually stateful.

Nanoboss has analogous theme hooks:

- `toolCardPendingBg`
- `toolCardSuccessBg`
- `toolCardErrorBg`

but they are currently no-ops and are not actually applied by the tool card renderer.

So nanoboss has the API shape but not the actual look yet.

---

## What nanoboss already matches well

Nanoboss already has several important pieces in place.

## 1. Transcript-level tool cards

Current nanoboss state:

- `UiToolCall`
- `UiTranscriptItem = turn | tool_call`

Relevant files:

- `src/tui/state.ts`
- `src/tui/reducer.ts`
- `src/tui/views.ts`

This is the correct transcript model and aligns with pi-mono conceptually.

## 2. Cards persist after completion

Tests confirm completed tool cards remain after `run_completed`:

- `tests/unit/tui-reducer.test.ts`

That is already much closer to pi-mono than the old ephemeral activity-line approach.

## 3. Wrapper suppression and branch collapsing

Nanoboss already suppresses wrapper-ish plumbing such as:

- `defaultSession:*`
- `procedure_dispatch_wait`

and reparents descendant depth when wrapper cards disappear.

That is good, and I would keep it.

## 4. Bounded previews across the HTTP/SSE bridge

Relevant files:

- `src/core/tool-call-preview.ts`
- `src/http/frontend-events.ts`
- `src/procedure/dispatch-progress.ts`

This is a solid design choice and should stay. Nanoboss is right not to forward unbounded raw ACP payloads into the event log and UI.

---

## The remaining gaps

## Gap 1: nanoboss has summaries, pi-mono has renderers

Nanoboss currently reduces all tool rendering to:

- title
- meta line
- input summary
- output summary
- error summary

That gives decent cards, but it is fundamentally different from pi-mono.

pi-mono is renderer-driven:

- `bash` renders like a shell command
- `read` renders like a file preview
- `edit` renders like a diff
- `write` renders like a staged file body

This is the main reason nanoboss still feels noticeably less rich.

## Gap 2: nanoboss collapses too early

`src/core/tool-call-preview.ts` aggressively normalizes to single-line summaries via `summarizeText()`.

That is useful for transport safety, but it throws away too much structure too early.

The result is:

- no multi-line preview
- no per-tool visual shape
- nothing to expand later

Nanoboss should still compact early, but into a **bounded preview model**, not into just one-liners.

## Gap 3: card shell is visually weaker than pi-mono

`src/tui/components/tool-card.ts` currently renders:

- manual ASCII border
- header + meta + section strings

But it does **not** use actual pending/success/error background styling the way pi-mono does with `Box`.

Also, nanoboss’s theme bg hooks are currently unused.

## Gap 4: no global expand/collapse

pi-mono’s `Ctrl+O` matters a lot because it allows useful defaults:

- cards can show a small preview by default
- user can reveal more detail on demand

Nanoboss has no such mechanism yet.

## Gap 5: no per-tool rich formatting

Specific missing pieces versus pi-mono:

- `bash`: shell-style header, partial output body, elapsed time, truncation/full-output-path notices
- `read`: multi-line contents preview with optional line-range/path formatting
- `edit`: diff rendering
- `write`: preview of written content
- `grep/find/ls`: list-shaped results rather than a single summary sentence

## Gap 6: no renderer state

pi-mono renderers can keep state per tool row.

Examples:

- bash caches rendered preview lines and duration timing state
- write caches syntax-highlighted content incrementally

Nanoboss does not need all of that, but it needs at least a lightweight equivalent if it wants to get visually close.

## Gap 7: history reconstruction is thinner

pi-mono can rebuild tool output from stored assistant/tool messages.

Nanoboss replays frontend events from `SessionEventLog`, which is fine for a live session, but the payloads are intentionally compact and not durable in the same way.

That is acceptable, but it means nanoboss should bias toward storing the **right compact preview structure** in the replay log.

---

## Recommended target architecture for nanoboss

## 1. Keep the current transcript model

Do **not** back away from:

- transcript-level tool cards
- wrapper suppression
- persistent completed cards

That part is already correct.

## 2. Replace one-line summary fields with a bounded preview model

Instead of only:

- `inputSummary?: string`
- `outputSummary?: string`
- `errorSummary?: string`

nanoboss should move toward something like:

```ts
interface ToolPreviewBlock {
  header?: string;
  bodyLines?: string[];
  warnings?: string[];
  truncated?: boolean;
}

interface UiToolCall {
  id: string;
  runId: string;
  title: string;
  kind: string;
  status: string;
  depth: number;
  isWrapper: boolean;
  durationMs?: number;
  callPreview?: ToolPreviewBlock;
  resultPreview?: ToolPreviewBlock;
  errorPreview?: ToolPreviewBlock;
}
```

Important: keep these **bounded**.

Suggested caps:

- max 10-20 body lines per preview depending on tool
- max chars per line
- warnings separate from body

This preserves transport safety while keeping enough structure to render pi-mono-like cards.

## 3. Add a local tool renderer registry

Nanoboss should copy pi-mono’s separation, but with simpler local code.

Suggested shape:

```ts
interface ToolCardRenderer {
  formatCall(toolCall: UiToolCall, expanded: boolean): ToolPreviewBlock | undefined;
  formatResult(toolCall: UiToolCall, expanded: boolean): ToolPreviewBlock | undefined;
}
```

Then:

- registry lookup by `kind`
- fallback renderer for unknown tools
- dedicated renderers for `bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`

This does not need to be as general as pi-mono’s `ToolDefinition.renderCall/renderResult`, but it should look the same architecturally.

## 4. Use `Box` and real background colors

Nanoboss should stop drawing tool cards as border-only text blocks.

It should instead use:

- `Box` from `pi-tui`
- actual background function based on status
- optional border or spacing on top of that

The current theme already exposes the right tokens; they just need to be implemented and used.

Suggested mapping:

- pending/running -> warning-ish neutral background
- completed -> green-tinted background
- failed/cancelled -> red-tinted background

This is one of the fastest ways to make nanoboss visually resemble pi-mono.

## 5. Add global tool expansion toggle

Add a nanoboss equivalent of pi-mono’s `Ctrl+O`.

Suggested changes:

- add `expandedToolOutput: boolean` to `UiState`
- add a reducer action to toggle it
- bind `ctrl+o` in `src/tui/app.ts`
- pass the flag into tool card formatting/rendering

This unlocks the biggest UX improvement:

- collapsed by default
- preview lines visible
- expandable on demand

## 6. Make known-tool cards look like pi-mono

### `bash`

Target:

- header: `$ <command>`
- body: last N lines while running/completed
- footer/warning: elapsed/duration, truncation/full-output-path notice when available

### `read`

Target:

- header: `read <path>` or `read <path>:<range>`
- body: first N visible lines of content
- warning: continuation/truncation notice if present

### `edit`

Target:

- header: `edit <path>`
- body: diff preview if available
- error inline on failure

### `write`

Target:

- header: `write <path>`
- body: first N lines of content being written
- error inline on failure

### `grep`, `find`, `ls`

Target:

- compact header with query/path metadata
- multi-line list preview body
- truncation warnings

This is where nanoboss can get very close without needing raw pi agent-core internals.

---

## Concrete file-level plan

## Phase 1: richer preview payloads

### Update

- `src/core/tool-call-preview.ts`
- `src/http/frontend-events.ts`
- `src/procedure/dispatch-progress.ts`

### Do

Change preview generation from one-line summary strings into bounded structured previews.

Good examples to copy from pi-mono:

- `bash`: command line + preview lines + warnings
- `read`: path/range + preview lines
- `edit`: path + diff excerpt if possible

### Constraint

Do **not** send unbounded `rawInput` / `rawOutput` through the event log.

---

## Phase 2: renderer registry in TUI

### Add

- `src/tui/components/tool-renderers/index.ts`
- `src/tui/components/tool-renderers/bash.ts`
- `src/tui/components/tool-renderers/read.ts`
- `src/tui/components/tool-renderers/edit.ts`
- `src/tui/components/tool-renderers/write.ts`
- `src/tui/components/tool-renderers/find.ts`
- `src/tui/components/tool-renderers/grep.ts`
- `src/tui/components/tool-renderers/ls.ts`
- `src/tui/components/tool-renderers/fallback.ts`

### Do

Move tool-specific layout decisions out of `tool-card-format.ts`.

That file can remain as a fallback helper, but it should not be the main rendering model.

---

## Phase 3: stronger card shell

### Update

- `src/tui/components/tool-card.ts`
- `src/tui/theme.ts`
- `src/tui/pi-tui.ts` already exports `Box`

### Do

Switch to a `Box`-based card shell with background by status.

Preserve indentation by depth.

Potential structure:

- title row with glyph
- optional meta line
- call preview block
- result/error preview block
- warnings block

---

## Phase 4: global expand/collapse

### Update

- `src/tui/state.ts`
- `src/tui/reducer.ts`
- `src/tui/app.ts`
- `src/tui/views.ts`

### Do

Add an app-level `Ctrl+O` toggle matching pi-mono semantics as closely as possible.

Suggested footer text update too.

---

## Phase 5: polish known tools

After the generic version is in place, close the remaining gap with per-tool behavior.

Priority order:

1. `bash`
2. `read`
3. `edit`
4. `write`
5. `grep`
6. `find`
7. `ls`

That ordering gives the biggest perceived parity fastest.

---

## What should stay different

A few differences are reasonable and probably should remain.

## 1. Wrapper suppression

Nanoboss should keep suppressing orchestration noise more aggressively than pi-mono.

Because nanoboss has ACP wrapper/procedure plumbing, this is user-friendly and probably necessary.

## 2. Early compaction of transport payloads

Nanoboss is right to sanitize/compact previews before they cross the HTTP/SSE boundary.

The change should be:

- compact into richer preview objects
- not revert to raw payload forwarding

## 3. No need to copy pi-mono’s exact extension API

Nanoboss does not need to adopt `ToolDefinition.renderCall/renderResult` literally.

It only needs a local equivalent that gives the UI the same shape.

---

## Closest practical parity target

If nanoboss implements the changes above, the UX can get very close to pi-mono:

- one stable card per tool call
- real status background
- meaningful multi-line preview by default
- `Ctrl+O` expansion
- shell-like `bash` cards
- file-preview `read` cards
- diff-style `edit` cards
- list-style `grep/find/ls` cards
- wrapper suppression preserved

What probably will still differ:

- exact data richness for unknown ACP tools
- image handling
- some renderer-state niceties
- perfect history reconstruction across all resume cases

That is fine. The visible UX can still feel closely aligned.

---

## Bottom line

The right mental model is:

**nanoboss should copy pi-mono’s tool rendering architecture, not just its styling.**

That means:

1. keep transcript-level tool cards
2. keep bounded transport-safe previews
3. stop collapsing everything into one-line summaries
4. add a renderer registry
5. use real pending/success/error card backgrounds
6. add global tool output expansion
7. implement per-tool formatting for the common built-ins

If you do only one thing next, do this:

> replace the current summary-only card body with a bounded multi-line preview + renderer registry + `Ctrl+O` expansion.

That is the biggest step toward pi-mono parity.
