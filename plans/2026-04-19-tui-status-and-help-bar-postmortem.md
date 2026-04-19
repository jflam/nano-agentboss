# TUI status/help bar redesign — postmortem and extensibility review

Companion to `2026-04-18-tui-status-and-help-bar-redesign-plan.md`. This reflects
on the five commits that implemented the plan and uses them as a case study for
a bigger question:

> Do the primitives exposed by the runtime + TUI adapter make sense as an
> extensibility surface for users who want Nanoboss to "build me a custom GUI"
> — both for (a) status/activity chrome segments and (b) custom cards/panels
> inside the transcript?

Short answer: **the work shipped cleanly, but it did not exercise any
extensibility seam. It re-confirmed how tightly coupled `state.ts`,
`reducer.ts`, `views.ts`, `controller.ts`, and `app.ts` are inside
`packages/adapters-tui`.** To unlock user-authored chrome or panels we need to
introduce three missing primitives — a **chrome slot registry**, an **input
binding registry**, and an **opaque card/panel payload** in the runtime event
stream. Details below.

## 1. What shipped

Five commits landed, in plan order (`676407b → 8c8ef6e → 45cf3ab → a583a5a →
2205f78`):

1. `tui: tighten activity bar labels and structure token usage formatting`
   — introduced `TokenUsageSummary`, `formatCompactTokenUsage`,
   `stripModelQualifier`, `formatElapsedRunTimer` in `format.ts`; reducer now
   stores `tokenUsage` (structured) alongside `tokenUsageLine` (legacy string).
2. `tui: split activity bar into identity and run-state lines` — replaced the
   single `buildActivityBarLine` with `buildActivityBarLines` returning 1–2
   lines, split into `buildIdentityBudgetParts` and `buildRunStateParts`.
3. `tui: priority-drop overflow on activity bar line 1 to avoid clipping` —
   added width-aware `IDENTITY_BUDGET_DROP_ORDER` cascade and a
   `visibleWidth`/`truncateToWidth` fallback for the first line.
4. `tui: replace static footer cheatsheet with contextual hint line` — reduced
   `buildFooterLine` to a context-aware 3–4 token hint (`ctrl+k keys`,
   `enter send`, `/help`, `esc stop`, etc.).
5. `tui: add ctrl+k keybinding overlay with reducer, controller, tests` — added
   `keybindingOverlayVisible` to `UiState`, a `keybindingOverlay/{toggle,dismiss}`
   reducer action pair, controller methods, `ctrl+k`/`esc` handlers in
   `app.ts`, and a new `KeybindingOverlayComponent` hard-wired into
   `NanobossAppView`'s constructor between the activity bar and the footer.

All five commits stayed **inside `packages/adapters-tui/`**. No change was
needed in `contracts`, `app-runtime`, `adapters-http`, or any procedure. Token
usage was the only value that already lived outside the TUI package and it was
already shipped as structured `AgentTokenUsage`, so the abstraction held.

## 2. What went well

- **The adapters-tui boundary is real.** The clipping bug was purely a
  rendering concern, and we fixed it without touching the runtime event stream
  or the HTTP contract. That is the correct shape.
- **Reducer/view/controller separation paid off.** The overlay landed as:
  one new state field + one pair of actions + one new `Component` + two
  keybindings in `app.ts`. Each commit was small and testable in isolation —
  `tui-views.test.ts`, `tui-reducer.test.ts`, `tui-controller.test.ts`,
  `tui-app.test.ts` all extended cleanly.
- **Width-aware priority drop is reusable.** The `IDENTITY_BUDGET_DROP_ORDER`
  cascade is the right pattern for any bounded chrome region; it's the first
  place we avoided `…` truncation as the default.
- **Token formatting moved to structured data.** `tokenUsage: TokenUsageSummary`
  in state is a model for how the view should consume runtime values: the
  source provides numbers, the view decides presentation density.

## 3. Friction observed while implementing

Even though everything landed in one package, the overlay feature touched the
same five files in lockstep:

| File | Change required for `ctrl+k` overlay |
|---|---|
| `state.ts` | new `keybindingOverlayVisible` field + default |
| `reducer.ts` | two new action variants, two case branches |
| `controller.ts` | two new methods, escape-handling branch |
| `app.ts` | two `matchesKey` branches, component wiring |
| `views.ts` | new `KeybindingOverlayComponent` class, constructor wiring |

That is five files to add one binding + one panel. Worse, the **list of keys
shown in the overlay is a hand-written string literal in `views.ts`** (lines
170–175). It is already out of sync with reality in subtle ways — e.g. the
overlay lists `ctrl+g auto-approve` but the controller method is
`toggleSimplify2AutoApprove`; if someone renames `ctrl+g`'s behaviour they must
remember to edit a markdown-esque line in `views.ts`. This is the classic
three-way drift pattern (matcher / action / documentation) that every
extensibility surface must solve before it can be handed to a user.

The activity bar had the same problem in miniature: `buildRunStateParts` is a
closed function containing one `if` per concern (`approve on`, `● busy`,
`proc`, `cont`, `steer`, `queued`). Any new run-state concept — e.g. "mcp
servers connected: 3", "memory cards pending sync: 2" — requires editing that
function.

## 4. Extensibility gap analysis

We walked through the two user scenarios the request called out and asked
"what would a user have to touch if Nanoboss built this for them today?"

### 4.1 Scenario A — user wants a new status-bar segment

Example: *"show me ● followed by the number of unsynced memory cards on line 2
of the activity bar, only when > 0, colored warning."*

Today, Nanoboss would have to:

1. Add a `memorySyncPending: number` field on `UiState`.
2. Extend `reducer.ts` to derive it from `memory_cards` / `memory_card_stored`
   events (already wired into reducer actions).
3. Edit `buildRunStateParts` in `views.ts` to append a new segment.
4. Teach the priority-drop cascade about the new segment if it should live on
   line 1.
5. Add a test in `tui-views.test.ts`.

None of that is user-authorable. The activity bar has **no plugin seam** — it
is a closed function. We should expose one.

### 4.2 Scenario B — user wants a custom card/panel

Example: *"when the `simplify2` procedure finishes, show a dashboard card with
a table of files changed + a `[re-run]` button."*

Today, procedures can emit exactly two UI events via the SDK (`UiApi`):

```ts
// packages/procedure-sdk/src/index.ts
export type UiCardKind = "proposal" | "summary" | "checkpoint" | "report" | "notification";
export interface UiCardParams { kind: UiCardKind; title: string; markdown: string; }
export interface UiApi { status(...); card(params: UiCardParams): void; /* … */ }
```

The card is serialized all the way to the TUI, where
`renderProcedureCardMarkdown` in `reducer.ts` turns it into a markdown turn and
the existing `MessageCardComponent` renders it. That gives us:

- **Closed kind enum.** A user cannot add a `kind: "dashboard"` without
  editing `packages/procedure-sdk/src/index.ts` and then `procedureCardTone`
  in `reducer.ts`.
- **Markdown-only payload.** No structured data survives the trip, so there is
  nothing for a custom renderer to bind to. Tables render as markdown tables
  (if they fit), no interactive elements, no per-row keybindings.
- **No "panel" concept at all.** Today a card is always a transcript turn.
  There is no slot for a persistent side-panel, no overlay registry, no
  concept of a card that lives in the activity region or above the composer.

Contrast this with continuations: `ContinuationUi` in
`packages/contracts/src/index.ts` is a **closed** union of
`Simplify2CheckpointContinuationUi | Simplify2FocusPickerContinuationUi`. Each
variant has its own overlay component hard-wired by discriminant in
`packages/adapters-tui/src/app.ts`. That pattern does not scale: every new
procedure that wants a custom prompt UI would require shipping a new contract
type *and* a new overlay component *in the TUI package*. The contracts
package becomes a dumping ground for UI shapes owned by specific procedures.

### 4.3 Additional seams the overlay work surfaced

- **Keybinding registry.** `app.ts` has a wall of `if (matchesKey(data,
  "ctrl+X")) …` branches. There is no list. A user extension cannot bind a key
  without patching `app.ts`. The `KeybindingOverlayComponent` cannot
  auto-derive its display from reality because no registry exists.
- **Chrome layout is hard-wired.** `NanobossAppView` adds children in its
  constructor in a fixed order: header → session → status → transcript →
  composer → activity bar → keybinding overlay → footer. There is no slot
  concept. An extension cannot contribute "a panel above the composer" or
  "another row below the footer" without editing this constructor.
- **Theme is closed.** `NanobossTuiTheme` is a concrete set of methods
  (`accent`, `dim`, `success`, `warning`, `error`, `text`). Fine for core, but
  extensions want their own palette entries. No way to register one.

## 5. Proposed primitives

We think there are **three** concrete additions that would cover both
scenarios and most realistic "help me build a custom GUI" requests, without
rewriting the TUI. They can be introduced one at a time and each is useful on
its own.

### 5.1 `ChromeSlot` registry (adapters-tui)

Replace the hard-wired children of `NanobossAppView` with named slots that a
caller can fill:

```ts
type ChromeSlotId =
  | "header" | "session" | "status"
  | "transcriptAbove" | "transcript" | "transcriptBelow"
  | "composerAbove" | "composer" | "composerBelow"
  | "activityBar" | "overlay" | "footer";

interface ChromeContribution {
  id: string;                                // user-chosen, for dedup/reorder
  slot: ChromeSlotId;
  order?: number;                            // for stable layout
  render(ctx: ChromeRenderCtx): Component;   // pure; gets state + theme
  shouldRender?(state: UiState): boolean;
}
```

`NanobossAppView` would keep built-in contributions for today's chrome (header,
session, status, activity bar, overlay, footer, composer) and simply iterate
the registry to build each slot's container. A custom panel then becomes
"register a contribution in the `transcriptBelow` slot."

The activity bar gets the same treatment one level down: replace
`buildIdentityBudgetParts` / `buildRunStateParts` with a registry of
`ActivityBarSegment`s, each with a `line: "identity" | "runState"`,
`order: number`, `priority: number` (for the drop cascade), and
`render(state)`. Core segments register themselves; user segments can register
alongside.

This is the minimum change that makes scenario A (a new status-bar segment)
authorable without editing `views.ts`.

### 5.2 Input-binding registry (adapters-tui)

Replace the `matchesKey` chain in `app.ts` with:

```ts
interface KeyBinding {
  id: string;                                // "ctrl+k.toggleOverlay"
  match: string | KeyMatcher;                // "ctrl+k" or fn(data)
  when?: (state: UiState) => boolean;        // predicate
  category: "compose" | "run" | "tools" | "theme" | "commands" | "custom";
  label: string;                             // one-line description
  run(ctx: BindingCtx): Promise<BindingResult> | BindingResult;
}
```

The overlay component renders from this registry. The test that currently
asserts the overlay "contains the string `ctrl+k keys`" becomes "the registry
contains a binding with id `…` in category `overlay`." Drift between
behaviour and documentation becomes impossible by construction.

Combined with 5.1, a user extension can now ship *both* a chrome contribution
and the key that toggles it, as a single package.

### 5.3 Opaque UI payload channel (contracts + procedure-sdk + runtime + TUI)

The hard part. Today every procedure-authored piece of UI has to fit into one
of: `UiStatusParams`, `UiCardParams` (fixed kind enum + markdown), or the
closed `ContinuationUi` union. None of those admit a user-defined renderer.

Proposal: introduce a **single opaque UI event shape** that carries a
`rendererId` and a JSON payload, and let the TUI look up the renderer at
runtime:

```ts
// procedure-sdk
interface UiPanelParams {
  rendererId: string;              // "acme/files-changed-dashboard@1"
  slot: ChromeSlotId;              // where it wants to live
  key?: string;                    // identity for update/replace
  payload: JsonValue;              // renderer-specific, validated downstream
  lifetime?: "turn" | "run" | "session";
}
interface UiApi {
  // existing …
  panel(params: UiPanelParams): void;
}
```

On the runtime side, this becomes a new `RuntimeEvent` variant (`ui_panel`)
carried on the existing SSE stream — no new transport work. On the TUI side,
a `PanelRenderer` registry maps `rendererId` → `(payload, state) => Component`.
Core ships renderers for the current card kinds so `UiCardParams` can be
retired into a thin wrapper (`panel({ rendererId: "nb/card@1", … })`).
`ContinuationUi` collapses the same way: simplify2's overlays become two
bundled renderers, and contracts stops carrying procedure-specific shapes.

**Validation.** Renderers are registered with a `typia` schema (matching the
existing pattern in the procedure SDK), so the TUI can reject or diagnose
mis-shaped payloads at the boundary instead of crashing mid-render.

**Key property.** A user extension that adds a new procedure + a new renderer
stays in one package and never touches `contracts`, `app-runtime`, or the core
TUI — which is the test we should hold any extensibility story to.

## 6. Ordered recommendations

Do not try to do all three at once. Suggested order, each step independently
useful:

1. **Introduce the keybinding registry (5.2).** Highest leverage, smallest
   blast radius: the five-file drift pattern observed in this work goes away,
   and the overlay starts driving itself from data. Scope is one package.
2. **Introduce the chrome slot + activity-bar segment registries (5.1).** Now
   scenario A is shippable by a user. Still one package.
3. **Introduce the opaque UI payload channel (5.3).** Pay the contract cost
   once, retire `UiCardKind` + the bespoke `ContinuationUi` union behind it,
   and scenario B becomes trivial.

Before any of that, we should prove step 1 with a migration of the existing
bindings and confirm that the overlay content becomes a derived value rather
than a literal.

## 7. Addendum — a live instance of the same anti-pattern

While reviewing the rendered version of this postmortem, the user noticed that
my final summary message appeared to be duplicated, with two short interstitial
lines wedged between the two copies. Investigation via the nanoboss run store
traced the cause to the runtime itself, not the model output:

- During the turn I emitted three separate assistant `text` blocks, properly
  interleaved with tool calls on the wire: two short interstitials ("Now let
  me look at…", "I have enough context. Let me write the postmortem.") and
  one final summary.
- The run's `replayEvents` array preserves the interleaving correctly across
  153 entries of `text_delta` / `tool_started` / `tool_updated` / etc.
- The derived `output.display` string, however, concatenates **every**
  `text_delta` chunk with no separators and strips the tool events. Result:
  `"<interstitial1><interstitial2><final summary>"` as one opaque blob.
- The TUI then renders this derived `display` on run completion *in addition
  to* streaming the same `text_delta`s live, producing the double-render the
  user observed.

This is a miniature instance of the same anti-pattern the postmortem argues
against: a view-layer summary that flattens structured events into a
pre-rendered string, so consumers cannot distinguish the pieces or re-render
differently. `UiCardParams` (markdown-only payload), the closed
`ContinuationUi` union, and `output.display` are all the same shape of
mistake — premature rendering in a layer that should have stayed structured.

### 7.1 Should we fix `output.display` as part of this plan?

**Yes.** It belongs in the same workstream as primitive 5.3 (the opaque UI
payload channel), for three reasons:

1. **Same root cause, same fix pattern.** Both problems go away if the
   runtime stops committing to a single rendered string and instead exposes
   structured events that the view layer composes. `output.display` should
   either carry structure (`{ blocks: Array<{ kind: "text" | "tool", … }> }`)
   or be derived on demand from `replayEvents` at render time.
2. **Small blast radius, high signal.** The fix is scoped to `app-runtime`
   plus the TUI's turn-rendering code — no contract change across adapters,
   no procedure-SDK change. It can ship before 5.3 as a proving ground for
   the "don't pre-render at the boundary" principle.
3. **It's a correctness bug today.** Unlike 5.1/5.2/5.3 which are pure
   extensibility work, this one produces visibly broken output right now for
   any turn with multiple text blocks — i.e. most non-trivial turns. Leaving
   it unfixed while designing a bigger plan around it would be strange.

Recommended sequencing: slot this as **step 0** of the plan derived from this
postmortem, ahead of primitive 5.2 (keybinding registry). Concretely:

- Change `output.display` from `string` to a structured block list — or drop
  it and render at display time — so interstitials and final messages are
  distinguishable.
- Update the TUI turn renderer to consume the new shape (and to avoid
  double-rendering live `text_delta`s + post-completion `display`).
- Add a regression test that a turn with interstitials + tool calls + a final
  message round-trips through the store without losing block boundaries.

If we take this on, the plan derived from this postmortem should open with a
short "step 0: structured display" before the three extensibility primitives.

## 8. Open questions

- Does Nanoboss want **remote** renderers (e.g. a procedure ships both sides
  of a panel) or only **local** ones (TUI knows all renderers ahead of time)?
  The former is more powerful but needs a sandboxing story; the latter is a
  90% solution and much cheaper. Recommend local-only for v1.
- Should activity-bar segments be able to read the full `UiState` or a
  narrowed projection? Narrowing enables memoization but complicates the API.
  Recommend full state for v1, revisit if renders become a hot path.
- Where do per-extension settings live? Out of scope for this note, but worth
  naming: today there is no session-scoped or user-scoped settings store that
  the TUI can offer to extensions.
