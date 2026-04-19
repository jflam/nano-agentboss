# Continuations, forms, and procedure panels plan

Supersedes steps 3.b and 3.c of `2026-04-19-tui-runtime-extensibility-primitives-plan.md`. Step 3.a's `PanelRenderer` registry is kept.

## Problem

Three related gaps in how procedures talk to the user:

1. **The continuation state machine is not engine-enforced.** `pendingContinuation` is set on `run_paused` in `packages/adapters-tui/src/reducer.ts:568` but is **not cleared** on `run_failed` (line 577) or `run_cancelled` (line 588). When a procedure's `resume` throws — observed in `/execute-plan` — the TUI stays paused and routes the next submit back through `resume`, which throws again. The correct behavior is: `resume` error is terminal, drop to the default session.

2. **`Continuation.ui` is a closed, procedure-specific union in contracts.** `packages/contracts/src/index.ts:106` hard-codes `Simplify2CheckpointContinuationUi | Simplify2FocusPickerContinuationUi`. Any new procedure wanting an interactive ask must patch `contracts`. Step 3.a's `PanelRenderer` is passive and slot-bound, so it cannot express the focus-capturing, reply-producing semantics continuations need (documented in the step 3.b blocker note).

3. **No always-visible channel for procedure output.** Procedures reuse tool cards for arbitrary notices today. Users can hide tool cards (`ctrl+t`); when they do, important procedure messages — including `resume` errors — disappear. Procedure output and tool activity are different kinds of things and should have different visibility.

## Proposed approach

Four steps, roughly in dependency order; each independently useful.

1. **Continuation lifecycle hardening.** Make the state machine engine-authoritative. Clear `pendingContinuation` on every terminal event. Add an optional `Procedure.cancel(state, ctx)` hook for best-effort cleanup. Treat `resume` errors as terminal.
2. **Procedure panels.** A new transcript block kind distinct from text and tool calls, with severity levels (`info | warn | error`), always visible regardless of the tool-card toggle. `ui.card(...)` becomes a thin wrapper. Errors from step 1 surface here.
3. **Form primitive.** An open `FormRenderer` registry alongside the existing `PanelRenderer`, with a render context that can own focus, handle input, submit a reply, and cancel. Replace `Continuation.ui` with `Continuation.form: { formId, payload }`.
4. **Simplify2 migration.** Move the two existing simplify2 overlays onto form renderers; delete the closed `ContinuationUi` union from contracts.

Step 1 fixes the observed `/execute-plan` bug on its own before any new primitive lands.

## Design

### 1. Continuation lifecycle

Terminal edges that must clear `pendingContinuation`:

- `resume` returns a non-`Continuation` result → `run_completed` (already clears).
- `resume` throws → `run_failed` (does **not** clear today; must).
- User cancels a form (esc) → new engine entry point `requestContinuationCancel(runId)` → `procedure.cancel?.(state, ctx)` → `run_cancelled` (does **not** clear today; must).
- External cancel (`ctrl+c` soft-stop) → same cancel path.

`Procedure.cancel?` is best-effort cleanup only. It cannot veto cancellation. If it throws, surface as an error procedure panel (step 2) and still transition to cancelled.

The TUI flag is driven exclusively by engine `run_*` events. Simplify2's disk-persisted `pendingContinuation` (`procedures/simplify2.ts:338, 2110, 2915`) remains as its own focus-state record but is not treated as authoritative for the TUI.

### 2. Procedure panels

New transcript block kind:

```ts
type TurnDisplayBlock =
  | { kind: "text"; ... }
  | { kind: "tool_call"; ... }
  | { kind: "procedure_panel"; panelId: string };

interface UiProcedurePanel {
  panelId: string;
  rendererId: string;            // reuses PanelRenderer registry
  payload: JsonValue;
  severity: "info" | "warn" | "error";
  dismissible: boolean;          // default false for error, true otherwise
  key?: string;                  // replace-by-key for in-flight updates
}
```

SDK addition — `ui.panel({ rendererId, payload, severity?, dismissible?, key? })`. `ui.card(...)` becomes a thin wrapper with `rendererId: "nb/card@1"` and `severity: "info"`.

Filtering invariant: `toolCardsHidden` gates `tool_call` blocks only. Procedure panels are never hidden by it; error-severity panels remain visible under any future procedure-panel filter.

`run_failed` additionally emits an error procedure panel (`rendererId: "nb/error@1"`, payload `{ procedure, message }`) so failures survive any filter state.

### 3. Form primitive

A sibling registry to `PanelRenderer` (panels are passive; forms own focus + input + reply, which is a different shape):

```ts
interface FormRenderContext<T> {
  payload: T;
  state: UiState;
  theme: NanobossTuiTheme;
  submit(reply: string): void;    // routes to controller.handleSubmit
  cancel(): void;                 // routes to engine cancel transition
  editor: EditorLike;             // for forms that seed the composer
}

interface FormRenderer<T = unknown> {
  formId: string;                 // e.g. "nb/simplify2-checkpoint@1"
  schema: TypeDescriptor<T>;      // typia-backed
  render(ctx: FormRenderContext<T>): Component;
}
```

Mount mechanism is unchanged from today: `view.showComposer(component) + tui.setFocus(component)` in `packages/adapters-tui/src/app.ts:549-656`. What changes is that `app.ts` looks the component up through `getFormRenderer(continuation.form.formId)` instead of a hardcoded `switch` on `continuation.ui.kind`.

Contract change:

```ts
interface Continuation<TState> {
  question: string;
  state: TState;
  inputHint?: string;
  suggestedReplies?: string[];
  form?: { formId: string; payload: JsonValue };  // was: ui?: ContinuationUi
}
```

v1 is modal-only (composer-replace with focus capture). Non-modal forms are deferred until a consumer asks.

### 4. Simplify2 migration

- Register `nb/simplify2-checkpoint@1` and `nb/simplify2-focus-picker@1` in a new `packages/adapters-tui/src/core-form-renderers.ts`; the implementations are the existing overlays moved behind the registry.
- Update `procedures/simplify2.ts:614-653, 1835, 2638` to emit `{ form: { formId, payload } }` instead of `{ ui: ... }`.
- Delete `Simplify2CheckpointContinuationUi`, `Simplify2FocusPickerContinuationUi`, and the `ContinuationUi` union from `contracts`.

Parity requirement: existing behavioral assertions must pass unchanged — `tui-app.test.ts:872` (press `1` → `handleSubmit("approve it")`), `tui-app.test.ts:951` (press `n` → editor text `"new "`), `tui-controller.test.ts:821/868/922`.

## Touch points

- `packages/procedure-engine/src/procedure-runner.ts` — add `requestContinuationCancel(runId)`; invoke `procedure.cancel?` on cancel; keep existing `run_failed` emission on `resume` throw.
- `packages/contracts/src/index.ts` — optional `Procedure.cancel`; `Continuation.form`; delete `ContinuationUi` and the two simplify2 shapes once migration is done.
- `packages/adapters-tui/src/reducer.ts` — clear `pendingContinuation` on `run_failed` and `run_cancelled`; handle new `procedure_panel` event; extend `TurnDisplayBlock` with the new kind.
- `packages/adapters-tui/src/controller.ts` — `handleContinuationCancel()`; submit routing uses the engine-authoritative flag.
- `packages/adapters-tui/src/app.ts` — replace simplify2 overlay `switch` with form-registry lookup.
- `packages/adapters-tui/src/form-renderers.ts` — new registry (mirrors `panel-renderers.ts`).
- `packages/adapters-tui/src/core-form-renderers.ts` — register the two simplify2 renderers.
- `packages/procedure-sdk/src/index.ts` — `ui.panel`; `ui.card` becomes a wrapper.
- `packages/app-runtime/src/runtime-events.ts` + `packages/adapters-http/src/event-mapping.ts` — `procedure_panel` event.
- `procedures/simplify2.ts` — emit `form` instead of `ui`.

## Tests

- Engine: `resume` throw produces one `run_failed`, no subsequent `run_paused`. `requestContinuationCancel` invokes `cancel` hook and emits `run_cancelled`. `cancel` hook throwing is non-fatal.
- Reducer: named regression `resume error does not trap user in paused state (execute-plan regression)` — `run_failed` clears `pendingContinuation`. Same for `run_cancelled`.
- Reducer: `procedure_panel` event appends a block; `toolCardsHidden` does not hide it; error-severity is non-dismissible by default; key-based replace preserves order.
- Form registry: dedup, lookup, typia payload validation. Mounting a form replaces the composer and captures focus. `submit("...")` reaches the controller. `cancel()` routes to the engine cancel transition.
- Simplify2 parity: the three existing behavioral assertions above pass unchanged after migration.

## Rollout order (todos)

1. Lifecycle: reducer clears `pendingContinuation` on terminal events + named regression test. **This alone fixes `/execute-plan`.**
2. Engine: `Procedure.cancel?` + `requestContinuationCancel` + controller `handleContinuationCancel`.
3. Procedure panels: runtime event + reducer block kind + SDK `ui.panel` + `nb/card@1` wrapper + `nb/error@1` + filter invariant test.
4. Form registry: `FormRenderer` + `form-renderers.ts` + `app.ts` mount via registry lookup.
5. Contract: `Continuation.form` added alongside deprecated `Continuation.ui` (dual-write).
6. Simplify2: register the two form renderers; flip `procedures/simplify2.ts` to emit `form`.
7. Delete `ContinuationUi` and the two simplify2 shapes from `contracts`.

## Open questions

- **Soft-stop vs. form-cancel.** Should `procedure.cancel` fire on both `ctrl+c` soft-stop and user-form-esc, or only the latter? Leaning both, so procedures always get a chance to persist "user bailed" state.
- **Panel ordering during streaming.** A procedure panel emitted mid-stream needs to interleave with `text_delta` blocks. Same boundary rule as tool calls should work; confirm during step 3.
- **Renderer versioning.** `formId`/`rendererId` carry `@N` suffixes — exact-match for v1, same convention as step 3.a.
