# TUI and runtime extensibility primitives plan

Derived from `2026-04-19-tui-status-and-help-bar-postmortem.md`.

## Problem

Two classes of user request — "let me add a segment to the status bar" and
"let me render a custom card/panel from my procedure" — are not authorable
today without patching core Nanoboss packages. The postmortem documents the
root causes:

- `NanobossAppView` has a hard-wired constructor; there is no slot concept for
  chrome contributions.
- `buildActivityBarLines` / `buildIdentityBudgetParts` / `buildRunStateParts`
  in `packages/adapters-tui/src/views.ts` are closed functions.
- `app.ts` binds keys via a `matchesKey` chain, and the `ctrl+k` overlay
  content is a hand-written string literal in `views.ts` — three-way drift
  between matcher, action, and documentation.
- Procedure-authored UI is limited to `UiStatusParams` + `UiCardParams`
  (markdown-only, closed `UiCardKind` enum). There is no structured payload
  channel and no panel concept.
- `ContinuationUi` in `packages/contracts/src/index.ts` is a closed union of
  simplify2-specific shapes, forcing contracts to carry procedure-specific
  rendering details.
- A concrete correctness bug surfaces the same anti-pattern at runtime:
  `output.display` in a run record concatenates every assistant `text_delta`
  into a single flat string with no block boundaries, causing the TUI to
  render interstitial prose and the final message as an undifferentiated
  blob and (in some paths) to double-render the final message.

## Proposed approach

Introduce extensibility primitives in the order they pay off, each
independently useful and each sized to land as a small number of commits:

0. **Structured turn display.** Replace the flat `output.display` string with
   a structured block list that preserves `text` / `tool_call` boundaries.
   Fixes the double-render bug and establishes the "don't pre-render at the
   boundary" pattern that the later primitives rely on.
1. **Input-binding registry** in `@nanoboss/adapters-tui`. Replace the
   `matchesKey` chain in `app.ts` with a data-driven registry. The `ctrl+k`
   overlay derives its content from the registry. Eliminates the 3-way drift.
2. **Chrome slot + activity-bar segment registries** in
   `@nanoboss/adapters-tui`. Replace the hard-wired `NanobossAppView`
   constructor and `buildRunStateParts` / `buildIdentityBudgetParts` with
   named slots and registered segments. Unlocks user-authored chrome.
3. **Opaque UI payload channel** across `@nanoboss/procedure-sdk`,
   `@nanoboss/app-runtime`, and `@nanoboss/adapters-tui`. Introduce
   `UiPanelParams { rendererId, slot, payload, key?, lifetime? }` plus a
   `PanelRenderer` registry in the TUI validated via `typia`. Retire
   `UiCardKind` and the procedure-specific `ContinuationUi` union behind it.

Steps are independent. Step 0 is a correctness bug and should land first.
Steps 1–2 are scoped to `@nanoboss/adapters-tui`. Step 3 is the only one that
touches contracts and should only land once 1–2 prove the registry pattern.

## Design

### 0. Structured turn display

**Motivation.** The postmortem traces the double-render of my own final
summary to `output.display`: a derived `string` that concatenates every
`text_delta` emitted during a turn, strips tool events, and yields
`"<interstitial1><interstitial2><final summary>"` with no boundaries. The TUI
renders this blob on run completion in addition to streaming the same chunks
live.

**Change.** In `@nanoboss/app-runtime`, change the derived display from a
flat string to a structured block list:

```ts
type TurnDisplayBlock =
  | { kind: "text"; text: string; origin: "stream" | "replay" }
  | { kind: "tool_call"; toolCallId: string };

interface TurnDisplay {
  blocks: TurnDisplayBlock[];
}
```

Consecutive `text_delta`s with no intervening tool event coalesce into one
`text` block; tool calls introduce explicit boundaries. The existing
`replayEvents` array stays the source of truth; `TurnDisplay` is a derived
projection that preserves structure.

**TUI consumption.** Update the turn renderer in
`packages/adapters-tui/src/views.ts` + `reducer.ts` to iterate blocks. Avoid
double-rendering: when a turn is streaming live, render from `text_delta`
events; on `run_completed`, rely on the structured `TurnDisplay` and do not
re-append the final chunk if it has already been rendered live.

**Touch points.**

- `packages/app-runtime/src/run-events.ts` (or wherever `output.display` is
  built today) — emit `TurnDisplay` instead of a flat string.
- `packages/adapters-http/src/event-mapping.ts` — re-export the new type.
- `packages/adapters-tui/src/reducer.ts` — update `UiTurn.markdown` handling
  to accept block lists, or introduce `UiTurn.blocks`.
- `packages/adapters-tui/src/views.ts` — render blocks in order, with
  distinct styling for interstitial vs. final text if desired.

**Tests.**

- New unit test in `packages/app-runtime/tests/`: a run with events
  `text_delta("a")`, `tool_started(t1)`, `tool_updated(t1)`, `text_delta("b")`
  produces `blocks: [text("a"), tool_call(t1), text("b")]`.
- Regression test in `packages/adapters-tui/tests/`: a turn with two
  interstitials + final message renders three text blocks separated by tool
  cards, and the final message is not duplicated after `run_completed`.

### 1. Input-binding registry

**Motivation.** Adding `ctrl+k` required edits in `state.ts`, `reducer.ts`,
`controller.ts`, `app.ts`, and `views.ts`. The overlay lists bindings as a
hand-written literal in `views.ts`, so matcher, action, and documentation
drift independently.

**API.**

```ts
// packages/adapters-tui/src/bindings.ts
interface KeyBinding {
  id: string;                                  // "overlay.toggle"
  match: string | KeyMatcher;                  // "ctrl+k" or fn(data)
  when?: (state: UiState) => boolean;
  category: "compose" | "run" | "tools" | "theme" | "commands" | "overlay" | "custom";
  label: string;                               // one-line description
  run(ctx: BindingCtx): void | Promise<void> | BindingResult;
}

interface BindingCtx {
  controller: NanobossTuiController;
  state: UiState;
  editor: EditorLike;
}

interface BindingResult { consume?: boolean; }
```

`registerKeyBinding(binding)` / `listKeyBindings()` on a module-level
registry. Core bindings (`enter`, `shift+enter`, `tab`, `escape`, `ctrl+o`,
`ctrl+g`, `ctrl+t`, `ctrl+p`, `ctrl+k`, `ctrl+c`, `ctrl+v`) are registered
from a single `core-bindings.ts` at module init.

**Input dispatch.** Replace the `matchesKey` chain in `app.ts` with a single
dispatch loop:

```ts
for (const binding of listKeyBindings()) {
  if (binding.when && !binding.when(this.state)) continue;
  if (!keyMatches(binding.match, data)) continue;
  const result = await binding.run({ controller, state, editor });
  if (result?.consume !== false) return { consume: true };
}
```

**Overlay as a derived view.** `KeybindingOverlayComponent` in `views.ts`
iterates `listKeyBindings()` grouped by `category` and renders `label`. No
more literal list.

**Touch points.**

- New file `packages/adapters-tui/src/bindings.ts` (registry + types).
- New file `packages/adapters-tui/src/core-bindings.ts` (registrations).
- `packages/adapters-tui/src/app.ts` — replace `matchesKey` chain with
  dispatch loop; keep editor-local matching (backspace/delete image tokens)
  as a separate pre-step if it stays editor-state-dependent.
- `packages/adapters-tui/src/views.ts` — overlay reads from the registry.

**Tests.**

- `tui-bindings.test.ts` — registration/dedup, `when` predicate gating,
  dispatch returns correct binding.
- Update `tui-app.test.ts`, `tui-controller.test.ts`, `tui-views.test.ts`
  to cover dispatch and overlay rendering through the registry.

### 2. Chrome slot and activity-bar segment registries

**Motivation.** Scenario A from the postmortem — "add a segment to the
activity bar showing unsynced memory cards" — is not authorable without
editing `views.ts`. The `NanobossAppView` constructor adds children in a
fixed order and `buildRunStateParts` / `buildIdentityBudgetParts` are closed
functions.

**Chrome slot registry.**

```ts
type ChromeSlotId =
  | "header" | "session" | "status"
  | "transcriptAbove" | "transcript" | "transcriptBelow"
  | "composerAbove" | "composer" | "composerBelow"
  | "activityBar" | "overlay" | "footer";

interface ChromeContribution {
  id: string;
  slot: ChromeSlotId;
  order?: number;
  shouldRender?(state: UiState): boolean;
  render(ctx: { state: UiState; theme: NanobossTuiTheme }): Component;
}
```

`NanobossAppView` iterates the registry per slot rather than wiring children
by hand. Today's components (header line, session line, status line,
transcript, composer, activity bar, keybinding overlay, footer) each become
a core `ChromeContribution` registered at module init.

**Activity-bar segment registry.**

```ts
interface ActivityBarSegment {
  id: string;
  line: "identity" | "runState";
  order?: number;
  priority?: number;                           // for drop-order cascade
  shouldRender?(state: UiState): boolean;
  render(ctx: { state: UiState; theme: NanobossTuiTheme }): string;
}
```

`buildActivityBarLines` iterates registered segments, applies the existing
priority-drop cascade using `priority`, and keeps width-aware behavior.
Today's segments (`@provider`, model, token usage, `approve on`, `● busy`,
`[time] …`, `proc /…`, `cont /…`, `steer N`, `queued N`) each become a core
`ActivityBarSegment`.

**Touch points.**

- New files `packages/adapters-tui/src/chrome.ts`,
  `packages/adapters-tui/src/activity-bar.ts`.
- `packages/adapters-tui/src/views.ts` — drive layout from registries.
- `packages/adapters-tui/src/index.ts` — export the registries' public API.

**Tests.**

- Registry tests for dedup, ordering, and `shouldRender`/`when` gating.
- Migrate existing `tui-views.test.ts` assertions (identity line, run-state
  line, priority drop) to assert registered-segment behavior and verify that
  every previous segment still renders correctly.

### 3. Opaque UI payload channel

**Motivation.** Scenario B from the postmortem — "render a custom dashboard
card from my procedure" — is blocked by `UiCardParams`'s closed kind enum and
markdown-only payload. `ContinuationUi` has the same problem with a closed
union in `contracts`. Both force the TUI to know all renderers at compile
time and all shapes to live in contracts.

**API.** Add a new SDK entry point:

```ts
// packages/procedure-sdk/src/index.ts
interface UiPanelParams {
  rendererId: string;                 // "nb/card@1", "acme/files-dashboard@1"
  slot: ChromeSlotId;                 // where the panel wants to live
  key?: string;                       // identity for update/replace
  payload: JsonValue;                 // renderer-specific
  lifetime?: "turn" | "run" | "session";
}
interface UiApi {
  // existing members …
  panel(params: UiPanelParams): void;
}
```

**Runtime event.** Add a new `RuntimeEvent` variant to
`packages/app-runtime/src/runtime-events.ts`:

```ts
| {
    type: "ui_panel";
    runId: string;
    rendererId: string;
    slot: ChromeSlotId;
    key?: string;
    payload: JsonValue;
    lifetime: "turn" | "run" | "session";
  }
```

No transport change — the event flows over the existing SSE stream through
`adapters-http`.

**TUI renderer registry.**

```ts
// packages/adapters-tui/src/panel-renderers.ts
interface PanelRenderer<T> {
  rendererId: string;
  schema: TypeDescriptor<T>;                   // typia-backed
  render(ctx: { payload: T; state: UiState; theme: NanobossTuiTheme }): Component;
}
registerPanelRenderer(renderer);
```

On `ui_panel` events, the reducer validates `payload` against the
renderer's schema and stores a `UiPanel` entry in the state; the view layer
renders it into the requested slot using the chrome slot registry from
step 2. Invalid payloads produce a diagnostic status line instead of
crashing.

**Migration.**

- Retire `UiCardKind` + `UiCardParams`: ship a core `nb/card@1` renderer
  whose payload is `{ kind, title, markdown }`. Keep `UiApi.card(...)` as a
  thin wrapper that emits `panel({ rendererId: "nb/card@1", … })`.
- Retire `ContinuationUi`: ship core renderers
  `nb/simplify2-checkpoint@1` and `nb/simplify2-focus-picker@1`, and drop
  the closed union from `contracts`. Continuations become
  `{ rendererId, payload }` pairs.

**Touch points.**

- `packages/contracts/src/index.ts` — remove `Simplify2*ContinuationUi*`
  and the `ContinuationUi` union once migration is complete.
- `packages/procedure-sdk/src/index.ts` — add `UiPanelParams`; keep `card`
  as a wrapper.
- `packages/procedure-engine/src/context/shared.ts` and `ui-events.ts` —
  add `ui_panel` to `ProcedureUiEvent`, route through the existing marker
  encoding.
- `packages/app-runtime/src/runtime-events.ts` — add the `ui_panel`
  variant and its envelope.
- `packages/adapters-http/src/event-mapping.ts` — re-export.
- `packages/adapters-tui/src/panel-renderers.ts` — new registry.
- `packages/adapters-tui/src/reducer.ts` — handle `ui_panel`, store
  `UiPanel` entries with `key`-based replace semantics and `lifetime`
  eviction rules.
- `packages/adapters-tui/src/views.ts` — render `UiPanel` entries through
  the chrome slot registry.

**Tests.**

- Contract test that an invalid `payload` surfaces as a diagnostic, not a
  crash.
- Round-trip test: a procedure calling `ui.panel({ rendererId: "nb/card@1",
  … })` renders identically to the pre-migration `ui.card(...)` path.
- Simplify2 continuation overlay renders identically before and after
  migration.

## Rollout order (todos)

1. Step 0: structured turn display (`TurnDisplay` block list, TUI consumer
   update, regression test). Land first — it is a correctness fix.
2. Step 1: input-binding registry + migration of every existing binding;
   overlay derives from the registry.
3. Step 2: chrome slot registry + activity-bar segment registry + migration
   of every existing contribution/segment.
4. Step 3.a: introduce `ui_panel` event end-to-end with a single core
   renderer (`nb/card@1`); retire `UiCardParams` behind it.
5. Step 3.b: migrate simplify2 continuation overlays to panel renderers.
6. Step 3.c: remove `ContinuationUi` / `Simplify2*ContinuationUi*` from
   `contracts` once no consumer remains.

Each step is independently shippable and leaves the system in a consistent
state. Steps 3.a → 3.c are a single workstream but can be landed across
multiple commits.

## Non-goals

- Remote/sandboxed renderers. v1 is local-only: the TUI loads all renderers
  it knows about at startup. A future plan can add code-signed remote
  renderers if demand materializes.
- Per-extension settings store. Out of scope; tracked as open question.
- Alternative frontends (web, GUI). The registries are designed so a second
  frontend could consume the same events, but no second frontend is being
  built as part of this plan.

## Tests at the plan level

- `packages/adapters-tui` `bun test` passes with parity on all existing
  reducer / controller / app / views tests throughout the migration.
- `packages/procedure-engine` `bun test` passes after the `ui_panel` event
  is added; existing card/status tests continue to pass through the
  compatibility wrapper.
- `packages/app-runtime` `bun test` passes with the new `TurnDisplay` shape
  and the `ui_panel` event.
- End-to-end: a sample procedure `examples/custom-panel-demo.ts` registers
  a renderer, emits a panel, and the TUI renders it in the requested slot
  without any core code changes beyond the demo's own files.

## Open questions

- **Settings.** Extensions will eventually need session-scoped and
  user-scoped configuration. Not in scope here, but the registry APIs
  should accept an opaque `settings` argument per contribution so we can
  wire one up later without an API break.
- **Renderer versioning.** `rendererId` carries an explicit `@N` version
  suffix. We should decide whether the TUI accepts multiple registered
  versions of the same id simultaneously (for rolling upgrades) or
  requires exact match. Recommend exact match for v1.
- **Panel layout in narrow terminals.** The chrome slot registry lets a
  panel request a slot, but very narrow widths may not accommodate all
  slots. Need a fallback rule — recommend "hide `transcriptAbove` /
  `composerAbove` slots below width N" — but the exact policy can be
  decided during step 2.
- **Streaming inside panels.** Core cards today are static. If a procedure
  wants to stream into a panel, the `ui_panel` event's `key` lets it
  replace-by-key, but we should decide whether to add a dedicated
  `ui_panel_delta` variant or require full-payload replace each time.
  Recommend full replace for v1; revisit if throughput becomes a problem.
