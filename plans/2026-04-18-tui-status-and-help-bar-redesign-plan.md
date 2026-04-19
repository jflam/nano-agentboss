# TUI status bar and help bar redesign plan

## Problem

At typical terminal widths (~100 cols) both chrome lines at the bottom of the TUI clip with an ellipsis:

- The **activity/status line** (`auto-approve … • agent … • model … • tokens …`) loses dynamic state that the user actually needs: token usage, timer, busy indicator, steer/queued counts, procedure name.
- The **footer/help line** (`enter send • shift+enter newline • ctrl+o tools • ctrl+g auto-approve • ctrl+p pause • ctrl+t …`) is mostly a static cheatsheet. Clipping it is largely harmless but it consumes the budget that the status line needs.

Today both are single-line and rendered in `packages/adapters-tui/src/views.ts` via `buildActivityBarLine()` and `buildFooterLine()`.

## Proposed approach

Three coordinated changes, ordered by cost-to-value:

1. **Allow the status bar to wrap to a second line**, split by concern, and only show the second line when non-default state exists.
2. **Tighten status bar labels** so the common case fits on a single line.
3. **Replace the static footer cheatsheet with a `ctrl+k` keybinding overlay**, leaving only a minimal, context-aware hint line.

Each change is independently useful; together they eliminate the ellipsis clipping seen in the reported screenshot while leaving overall chrome height unchanged at idle.

## Design

### 1. Two-line status bar (grouped by concern)

Split `buildActivityBarParts` into two logical groups:

- **Line 1 – identity / budget** (always shown):
  - agent (provider)
  - model
  - token usage (`tokenUsageLine`)
- **Line 2 – run state** (shown only when any member is non-default):
  - `auto-approve on/off`
  - `● busy` + run timer
  - `procedure /<name>`
  - `continuation /<name>`
  - `steer N`, `queued N`

Rendering rules:

- If line 2 has zero parts after filtering, render only line 1 (no extra row consumed at idle).
- Line 1 must never wrap; if it still overflows after label tightening, apply the priority-drop rule below.
- Line 2 may wrap to multiple lines if extremely busy (rare); no hard truncation with `…`.

### 2. Tightened labels

Apply minimal, non-lossy shortening in the status builders:

| Current | New |
|---|---|
| `agent copilot` | `@copilot` |
| `model claude-opus-4.7/medium` | `claude-opus-4.7/medium` (drop the `model` label; `/` already signals it) |
| `tokens 32,499 / 168,000 (19.3%)` | `tok 32.5k/168k (19%)` |
| `auto-approve off` / `auto-approve on` | `approve off` / `approve on` |
| `procedure /simplify2` | `proc /simplify2` |
| `continuation /simplify2` | `cont /simplify2` |

`tokenUsageLine` is assembled upstream (outside `views.ts`); the abbreviation has to happen where the string is built. Either:

- shorten at the source, or
- change `tokenUsageLine` from a pre-formatted string to structured numbers and let the view format it.

Prefer the structured-number approach so the view can choose compact vs. verbose based on width.

### 3. Overflow priority-drop (safety net)

If line 1 still exceeds terminal width after tightening, drop parts in this order before falling back to truncation:

1. token percentage `(19%)`
2. token denominator (`/168k`)
3. agent name (`@copilot`)
4. model trailing qualifier (`/medium`)

Truncation with `…` becomes a last-resort, not the default.

### 4. `ctrl+k` keybinding overlay

Replace the bulk of `buildFooterLine()` with an opt-in overlay:

- New UI state flag, e.g. `keybindingOverlayVisible: boolean`.
- `ctrl+k` toggles it; `esc` or `ctrl+k` again dismisses it.
- Overlay lists everything currently in `buildFooterLine()` plus the new `ctrl+k` binding itself, grouped by category (send/compose, tools, run control, theme, commands).
- Rendered as a bordered panel above the input, or as a replacement for the transcript tail while visible — whichever integrates more cleanly with existing `Component` layout primitives.

### 5. Contextual footer hint (steady state)

Footer shrinks to the minimum needed to advertise the overlay and situational actions:

- Default: `ctrl+k keys • enter send • /help`
- When `inputDisabled`: `esc stop • tab queue • N pending` (plus `ctrl+k keys`)
- When `liveUpdatesPaused`: keep the existing pause message unchanged.
- When `pendingContinuation`: append `/dismiss`.

Everything else (`shift+enter`, `ctrl+o`, `ctrl+g`, `ctrl+p`, `ctrl+t`, `/new`, `/model`, `/light`, `/dark`, `/quit`) moves into the overlay.

## Touch points

- `packages/adapters-tui/src/views.ts`
  - `buildActivityBarLine` → return `string[]` (1 or 2 lines), or split into `buildIdentityLine` + `buildRunStateLine`.
  - `buildActivityBarParts` → split into identity vs. run-state helpers with tightened labels.
  - `buildFooterLine` → reduce to contextual hints.
  - Add `KeybindingOverlayComponent`.
- `packages/adapters-tui/src/reducer.ts`
  - Add `keybindingOverlayVisible` to `UiState` with default `false`.
  - Handle toggle/dismiss actions.
- `packages/adapters-tui/src/controller.ts`
  - Bind `ctrl+k` to toggle the overlay.
  - Ensure `esc` dismisses the overlay before falling through to existing `esc stop` behavior.
- Wherever `tokenUsageLine` is produced (search for `tokenUsageLine` assignment) — switch to structured token fields so the view can format compactly. If disruptive, do a string-level abbreviation there as a smaller first step.

## Tests

Update/extend existing tests in `packages/adapters-tui/tests/`:

- `tui-views.test.ts`
  - Line 1 renders identity + tokens, never clipped at typical widths (80, 100, 120).
  - Line 2 hidden at idle-default state; shown when any run-state flag is set.
  - Priority-drop order verified with a narrow width.
  - Contextual footer variants (default, `inputDisabled`, `liveUpdatesPaused`, `pendingContinuation`).
  - Keybinding overlay renders all expected bindings, including `ctrl+k` itself.
- `tui-reducer.test.ts`
  - `keybindingOverlayVisible` toggle and dismiss semantics.
- `tui-controller.test.ts`
  - `ctrl+k` toggles overlay; `esc` dismisses overlay without triggering `esc stop`; `esc` still stops when overlay is closed and a run is active.

## Rollout order (todos)

1. Structured token usage + label tightening in activity bar (no behavior change, pure formatting).
2. Split activity bar into 1–2 lines with conditional line 2.
3. Priority-drop overflow logic + width-aware rendering.
4. Contextual minimal footer.
5. `ctrl+k` overlay (state, keybinding, component, tests).

Steps 1–2 alone should resolve the reported clipping for the common case; steps 3–5 are the polish and extensibility work.

## Open questions

- Should the overlay be modal (blocks typing) or non-modal (layered, typing still goes to input)? Non-modal is nicer but slightly more work; modal is simpler and matches how most TUIs do cheatsheets.
- Do we want a glyph-based ultra-compact mode (`🅰 off`, `⏱ 00:42`) as a future toggle, or keep text-only? Text-only for now.
- `tokenUsageLine` origin: is it produced inside the TUI package or upstream in the engine? Confirm before choosing the structured-field refactor vs. in-place string shortening.
