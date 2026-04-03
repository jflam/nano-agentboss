# 2026-04-03 pi-tui migration plan for nanoboss

## Goal

Replace nanoboss's current custom terminal frontend with `@mariozechner/pi-tui` so nanoboss stops owning low-level TTY behavior and bespoke CLI UI code.

The desired outcome is:

- nanoboss keeps its current backend and transport model
- nanoboss gains a retained-mode terminal UI built on pi's TUI package
- nanoboss no longer maintains custom readline-driven prompt UX, raw-mode selectors, and ad hoc rendering logic

---

## Primary motivation

The current frontend works, but it still makes nanoboss responsible for terminal concerns that are expensive and annoying to maintain:

- raw terminal mode handling
- multiline prompt behavior
- cursor movement and cleanup
- resize handling
- alternate-screen selection UIs
- input history and paste behavior
- key decoding across terminals/tmux
- custom rendering decisions for streamed output

`packages/tui` in the pi repo already exists specifically to own those problems.

The migration should therefore aim to:

1. **reuse pi's TUI package directly**
2. **avoid copying pi's coding-agent app layer**
3. **keep nanoboss-specific code limited to state, orchestration, and small app-specific overlays**

---

## Architectural recommendation

## Keep unchanged

Do not rewrite nanoboss backend/runtime logic during this migration.

Keep the following systems intact:

- `src/service.ts`
- `src/http-client.ts`
- `src/http-server.ts`
- `src/frontend-events.ts`
- session creation/resume semantics
- SSE event model
- downstream ACP/MCP runtime
- stored session model

These are not the problem. The migration target is the frontend only.

## Replace

Replace the current custom terminal UI layer:

- `cli.ts` readline loop
- `readPromptInput(...)`
- `OutputClient`
- `src/cli-model-picker.ts`
- raw selector logic in `resume.ts`
- possibly `src/terminal-markdown.ts` if pi-tui Markdown is sufficient

## Reuse target

Use **only** the standalone pi TUI package:

- `packages/tui`
- npm package: `@mariozechner/pi-tui`

Do **not** transplant pi's coding-agent interactive mode:

- `packages/coding-agent/src/modes/interactive/*`

That layer is application-specific and tightly coupled to pi's own agent/session/theme/extension model.

---

## Recommended end state

Nanoboss should end up with a small TUI adapter layer like this:

```text
frontend events (SSE)
  -> nanoboss UI reducer/state
  -> pi-tui component tree
  -> differential terminal rendering
```

The new frontend should:

- use pi-tui's `TUI` and `ProcessTerminal`
- use pi-tui's `Editor` for input
- use pi-tui's `Markdown` and `Text` for transcript rendering
- use pi-tui's `SelectList` for model and session pickers
- keep nanoboss logic in a state/controller layer rather than in rendering code

---

## Dependency strategy

## Recommendation

Add `@mariozechner/pi-tui` as a normal dependency and pin it to an exact version.

Reasoning:

- lowest long-term maintenance burden
- upstream continues to own TTY correctness
- nanoboss only owns app-level adaptation
- avoids copying 10k+ LOC of terminal framework code

## Avoid

Do not:

- vendor pi's coding-agent TUI code
- fork pi-tui immediately
- copy random pieces out of `packages/tui` unless Bun packaging forces it

## Safety seam

Add a thin local re-export file so nanoboss imports pi-tui through one local adapter:

- `src/tui/pi-tui.ts`

That seam makes later upgrades or patches much easier.

---

## Proposed new frontend structure

Add a small new frontend subsystem under `src/tui/`.

## Proposed files

```text
src/tui/
  run.ts
  app.ts
  state.ts
  reducer.ts
  commands.ts
  pi-tui.ts
  theme.ts
  views.ts
  overlays/
    model-picker.ts
    session-picker.ts
```

## Responsibilities

### `src/tui/run.ts`
- entrypoint for the new TUI mode
- parse flags
- connect/create/resume session
- bootstrap the app controller

### `src/tui/app.ts`
- own the pi-tui root object
- own the component tree
- subscribe to the SSE event stream
- dispatch reducer actions
- keep UI synchronized with state

### `src/tui/state.ts`
- define the UI state interfaces
- no rendering logic

### `src/tui/reducer.ts`
- pure state transitions from:
  - frontend events
  - local user actions
  - slash command handling

### `src/tui/commands.ts`
- classify local slash commands vs forwarded commands
- host command routing for:
  - `/new`
  - `/end`
  - `/quit`
  - `/exit`
  - `/model`

### `src/tui/pi-tui.ts`
- local stable import seam over `@mariozechner/pi-tui`

### `src/tui/theme.ts`
- nanoboss-specific color/theme functions for pi-tui components

### `src/tui/views.ts`
- build/update view representation from UI state
- keep rendering decisions in one place

### `src/tui/overlays/model-picker.ts`
- model/provider picker using `SelectList`

### `src/tui/overlays/session-picker.ts`
- saved-session picker using `SelectList`

---

## Recommended initial UI layout

Start simple.

```text
[header]
[status line]
[chat / transcript area]
[pending activity area]
[editor]
[footer hints]
```

## Suggested component usage

Use stock pi-tui components wherever possible:

- `TUI`
- `Container`
- `Text`
- `TruncatedText`
- `Markdown`
- `Spacer`
- `Editor`
- `SelectList`
- overlays

## Root component tree

- root `TUI`
  - header container
  - status container
  - chat container
  - pending activity container
  - editor container
  - footer container

The first version should avoid custom widgets entirely if possible.

---

## UI state model

Do not let rendering components become the source of truth.

Keep state in a reducer-style model.

## Suggested state shape

```ts
interface UiTurn {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  markdown: string;
  status?: "streaming" | "complete" | "failed";
  meta?: {
    runId?: string;
    tokenUsageLine?: string;
  };
}

interface UiToolCall {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  depth: number;
  isWrapper: boolean;
}

interface UiState {
  sessionId: string;
  buildLabel: string;
  agentLabel: string;
  availableCommands: string[];

  turns: UiTurn[];
  toolCalls: Map<string, UiToolCall>;

  activeRunId?: string;
  activeAssistantTurnId?: string;
  runStartedAt?: number;

  statusLine?: string;
  promptDiagnosticsLine?: string;
  tokenUsageLine?: string;

  inputDisabled: boolean;
}
```

This replaces the current approach where event handling and terminal output are interleaved in `OutputClient`.

---

## Event mapping plan

The current behavior in `cli.ts` should be converted into reducer/state transitions.

## `run_started`

Current behavior:
- begin markdown stream
- mark response active

New behavior:
- create an active assistant turn
- set `activeRunId`
- disable submit
- clear per-turn token usage state
- set status line to a concise running state

## `text_delta`

Current behavior:
- stream markdown directly to stdout

New behavior:
- append text to the active assistant turn's markdown buffer
- re-render transcript through pi-tui

## `tool_started`

Current behavior:
- write tool start trace line

New behavior:
- create or update a `UiToolCall`
- show it in the pending activity area

## `tool_updated`

Current behavior:
- write tool update trace line

New behavior:
- update the tool call state
- keep completed/failed state in pending area or convert it to finalized trace if needed

## `memory_cards`

Current behavior:
- write trace lines to stderr

New behavior:
- expose as compact diagnostic/status content
- keep out of the main transcript unless intentionally preserved

## `prompt_diagnostics`

Current behavior:
- write a diagnostics line to stderr

New behavior:
- store as status or diagnostic content
- avoid cluttering the transcript

## `run_heartbeat`

Current behavior:
- periodically print `still working` lines

New behavior:
- update a single status line in place conceptually
- do not append repeated noise to the transcript

## `run_completed`

Current behavior:
- finish markdown stream
- print token usage line

New behavior:
- finalize active assistant turn
- attach token usage summary if desired
- clear active run state
- re-enable input

## `run_failed`

Current behavior:
- end response
- print an error line

New behavior:
- mark assistant turn failed or append a compact error turn
- re-enable input
- update status line

---

## Transcript design recommendation

Use a **split between finalized transcript and ephemeral runtime activity**.

## Finalized transcript

Should contain:

- user turns
- assistant turns
- important failure messages

## Ephemeral runtime area

Should contain:

- active tool calls
- heartbeats
- prompt diagnostics
- transient token usage / run state

This creates a cleaner UI than the current stderr trace stream and avoids turning every temporary state change into transcript noise.

---

## Editor and slash command migration

## Replace readline with pi-tui `Editor`

Use `Editor` for:

- multiline prompt entry
- prompt history
- paste handling
- keyboard interaction
- slash command completion

## Slash command split

Nanoboss has two command classes.

### Local commands
These stay client-side:

- `/new`
- `/end`
- `/quit`
- `/exit`
- interactive `/model`

### Forwarded commands
Everything else is sent as prompt text to the server.

## Autocomplete
Use `CombinedAutocompleteProvider` with:

- `availableCommands`
- current working directory

Initial scope should be modest:

- slash-command completion first
- file/path completion only after the basic UI is stable

## Input disable policy

While a run is active:

- simplest initial behavior: disable submit only
- allow drafting if easy, but not required for MVP

---

## Model picker migration

Current implementation:

- `src/cli-model-picker.ts`
- numeric prompt loop using `question()`

Replace with:

- pi-tui overlay using `SelectList`

## Flow

1. user enters `/model`
2. open provider selection overlay
3. open model selection overlay
4. update local banner state
5. send resulting `/model <provider> <model>` command using existing helper behavior

This deletes another custom prompt UI and consolidates interaction under one terminal framework.

---

## Resume/session picker migration

Current implementation:

- `resume.ts`
- custom raw-mode alternate-screen list

Replace with:

- pi-tui `SelectList` overlay or startup screen

## Display content per item

Each saved session item should show:

- short session id
- updated timestamp
- cwd
- provider/model summary
- markers like `here` or `native`

Once this lands, the raw cursor-selection logic in `resume.ts` should be removable, leaving only session-discovery logic.

---

## Markdown strategy

## Recommended first choice

Use pi-tui `Markdown` directly.

This is the most maintainable path because it keeps nanoboss from owning a separate markdown rendering pipeline.

## Defer preservation of current CLI appearance

Do not try to preserve exact `markdansi` behavior in phase 1.

If the visual differences are acceptable, remove `src/terminal-markdown.ts` entirely.

If there are major rendering regressions later, consider a custom component as a targeted fallback, but not as the default plan.

---

## Build and packaging plan

## Phase 0 validation requirement

Before committing to the migration, verify:

1. `@mariozechner/pi-tui` imports cleanly under Bun
2. `bun run build` still works
3. compiled `dist/nanoboss` binary still behaves correctly in TUI mode

## Specific runtime checks

Must test all of these early, not at the end:

- normal terminal session
- tmux
- resize behavior
- Ctrl+C / clean exit
- alternate-screen overlays
- session picker
- model picker
- built binary behavior after `bun run build`

The main risk is not API usage; it is terminal/runtime behavior after compilation.

---

## Testing strategy

## A. State/reducer tests

Highest-value automated tests.

Add pure tests for:

- frontend event -> state transitions
- local command handling
- active run lifecycle
- tool lifecycle
- failure handling
- `/new` session reset behavior

These tests should not require a real terminal.

## B. Controller/app tests

Test:

- submitting a prompt creates a user turn
- active run disables submit
- completion reenables submit
- `/model` opens picker and sends correct command

## C. Manual terminal smoke tests

Manually verify:

- startup
- prompt submission
- streaming output
- tool progress visibility
- `/new`
- `/model`
- resume picker
- resize while streaming
- failure cases
- exit cleanup

## D. Build smoke

Always verify the compiled binary, not just `bun run`.

---

## Migration phases

## Phase 0: dependency spike

### Goal
Prove pi-tui is viable in nanoboss under Bun and in the compiled binary.

### Tasks
1. Add `@mariozechner/pi-tui`
2. Add `scripts/tui-smoke.ts`
3. Verify a minimal `TUI + Editor + SelectList` demo
4. Verify `bun run build`
5. Verify compiled binary behavior

### Exit criteria
- pi-tui works in dev mode
- pi-tui works in compiled mode
- no obvious Bun/package blocker remains

---

## Phase 1: parallel TUI entrypoint

### Goal
Develop the new frontend without disrupting the existing CLI.

### Tasks
1. add `nanoboss tui`
2. keep `nanoboss cli` unchanged for now
3. create `src/tui/run.ts`
4. wire command dispatch in `nanoboss.ts`

### Exit criteria
- `nanoboss tui` starts
- connects to server
- creates or resumes a session
- shows a minimal screen

---

## Phase 2: minimal app shell

### Goal
Get a fully functional but minimal retained-mode frontend.

### Tasks
1. create root TUI app/controller
2. render:
   - header
   - status line
   - transcript area
   - editor
3. hook prompt submission to existing HTTP/SSE flow
4. render basic streamed assistant output

### Exit criteria
- user can send prompts
- assistant responses stream into transcript
- editor remains functional

---

## Phase 3: reducer-driven event handling

### Goal
Move current `OutputClient` behavior into structured state transitions.

### Tasks
1. add `UiState`
2. add reducer
3. map each frontend event type into state changes
4. stop rendering directly from event handlers
5. rebuild transcript/pending/status areas from state

### Exit criteria
- event handling is state-driven rather than stdout-driven
- app behavior no longer depends on interleaved output writes

---

## Phase 4: local command routing

### Goal
Preserve current client-side command behavior.

### Tasks
1. add command router for:
   - `/new`
   - `/end`
   - `/quit`
   - `/exit`
   - `/model`
2. forward unknown slash commands unchanged
3. reconnect streams on `/new`
4. cleanly stop TUI on exit commands

### Exit criteria
- local commands work in TUI mode
- backend semantics remain unchanged

---

## Phase 5: model picker migration

### Goal
Delete numeric readline-based model selection.

### Tasks
1. build provider/model overlays with `SelectList`
2. replace `/model` numeric flow
3. update current banner state immediately on selection
4. send built model command through existing prompt flow

### Exit criteria
- `/model` works entirely inside the TUI
- `src/cli-model-picker.ts` becomes removable

---

## Phase 6: resume/session picker migration

### Goal
Delete custom raw terminal picker logic.

### Tasks
1. build session picker overlay/screen
2. wire it into `resume --list`
3. preserve existing selection semantics and labels
4. remove custom raw cursor selection logic

### Exit criteria
- `resume --list` uses pi-tui
- no bespoke alternate-screen picker code remains

---

## Phase 7: tool and runtime activity rendering

### Goal
Move noisy tool/status output into the retained UI model.

### Tasks
1. render active tool calls in pending activity area
2. surface heartbeat as status rather than repeated log lines
3. render prompt diagnostics in a compact non-transcript area
4. decide whether token usage belongs in pending area or finalized assistant metadata

### Exit criteria
- stderr tool-line streaming is no longer central to UX
- runtime activity is visually stable and easier to reason about

---

## Phase 8: parity review and default cutover

### Goal
Decide when the TUI path is good enough to become the default.

### Tasks
1. compare `nanoboss tui` to the current CLI behavior
2. fix any missing essential flows
3. make `nanoboss cli` dispatch to the new TUI path
4. keep a short-lived legacy fallback only if necessary

### Exit criteria
- TUI frontend is the default path
- old readline frontend is no longer necessary for normal use

---

## Phase 9: cleanup

### Goal
Remove the old custom frontend implementation.

### Cleanup candidates
Likely removable or drastically simplified:

- readline loop in `cli.ts`
- `readPromptInput(...)`
- `PromptReader` abstraction
- `OutputClient`
- `src/cli-model-picker.ts`
- raw picker code in `resume.ts`
- `src/terminal-markdown.ts` if pi-tui Markdown is retained

### Exit criteria
- only one frontend path remains
- no dead custom TTY UI code is left behind

---

## Concrete implementation order

This is the recommended execution order:

1. add dependency and smoke-test `TUI + Editor`
2. add `nanoboss tui`
3. render basic shell with header/transcript/editor
4. hook prompt submission to existing HTTP/SSE flow
5. stream assistant output into transcript
6. implement local commands
7. replace `/model` with overlay picker
8. replace resume picker with TUI picker
9. move tool/heartbeat/diagnostics into pending/status areas
10. verify built binary behavior
11. flip `cli` to use the TUI path
12. delete the legacy frontend

---

## Key decisions to preserve discipline

## 1. Do not copy pi's coding-agent UI layer

Use only `@mariozechner/pi-tui`.

## 2. Keep nanoboss frontend thin

Nanoboss-specific code should mostly be:

- state
- reducer
- controller
- command router
- two small pickers

## 3. Prefer stock components over custom widgets

Use `Editor`, `Markdown`, `Text`, `SelectList`, overlays before writing custom components.

## 4. Keep backend and frontend migrations separate

Do not mix service/runtime changes into this work unless absolutely necessary.

## 5. Ship in parallel first

Build `nanoboss tui` before replacing `nanoboss cli`.

---

## Main risks and mitigations

## Risk: markdown output differs from current CLI

### Mitigation
- accept differences initially
- tune pi-tui theme first
- only revisit custom markdown rendering if differences are truly unacceptable

## Risk: compiled Bun binary behaves differently

### Mitigation
- test `bun run build` early and repeatedly
- make compiled binary behavior a first-class acceptance criterion

## Risk: upstream pi-tui changes quickly

### Mitigation
- pin an exact version
- use `src/tui/pi-tui.ts` as a stable local seam

## Risk: too much custom component logic creeps in

### Mitigation
- keep the view layer simple
- move app behavior into reducer/controller code
- prefer stock components and overlays

---

## Estimated effort

Approximate effort if done cleanly:

- dependency spike: 0.5 to 1 day
- MVP TUI shell: 1 to 2 days
- feature parity and polish: 2 to 4 days
- cutover and cleanup: 0.5 to 1 day

Expected total: roughly **4 to 8 working days** depending on polish level and compiled-binary issues.

---

## Definition of done

This migration is complete when:

1. nanoboss uses `@mariozechner/pi-tui` as its default interactive terminal frontend
2. prompt entry, streaming output, `/model`, and session resume all work inside that frontend
3. the built binary behaves correctly in normal terminal usage
4. the old readline/raw terminal frontend code is removed
5. nanoboss no longer owns custom low-level CLI/TUI logic beyond app-specific orchestration

At that point nanoboss will still own its product UX, but it will no longer own the terminal framework itself.
