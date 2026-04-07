# Command surface formalization plan

## Problem

Nanoboss currently has three different kinds of slash-like commands, but the distinction is only partially encoded in the codebase:

1. **Frontend-only commands**: handled entirely in the TUI/frontend and never sent to the service or agent. Examples: `/dark`, `/light`.
2. **Harness commands**: executed by nanoboss itself because they mutate or inspect harness/session state. Example: `/model`.
3. **Procedures**: executable commands that may run directly in the harness or be dispatched through the default conversation path, depending on behavior. Examples: `/default`, `/second-opinion`, custom procedures.

Today:

- `src/tui/commands.ts` mixes frontend-only commands with commands that also exist as real procedures.
- `Procedure.executionMode` now exists, but only captures part of the distinction and only for registered procedures.
- `NanobossService.prompt()` still contains routing logic that infers behavior from a mix of command text, procedure identity, and execution mode.
- The frontend command list, autocomplete, and dispatch routing do not share a single source of truth.

This makes it easy to misclassify commands like `/model`, and hard to reason about where a new command belongs.

## Proposed classification

Use the following taxonomy as the intended long-term model:

### 1. Frontend-only commands

- Scope: one frontend instance only
- Examples: `/dark`, `/light`, possibly other purely presentational toggles
- Never appear as harness procedures
- Never go through service routing or default-conversation dispatch

### 2. Harness commands

- Scope: nanoboss session/harness state
- Examples: `/model`, and any future command that mutates session defaults, session metadata, or local runtime state
- Executed by nanoboss core/service, not by the downstream agent
- May have frontend affordances (for example, `/model` can open a picker in the TUI), but those are UI helpers on top of a harness command, not a separate command class

### 3. Procedures

- Scope: normal command execution surface
- Registered in the procedure registry
- May be executed directly by the harness or delegated through the default-conversation dispatch path, but they are still part of the procedure layer rather than the frontend-control or harness-control layer

## Target design

Introduce one shared command descriptor model that separates:

- **what the command is**
- **where it executes**
- **which frontends should expose it**

Suggested shape:

```ts
type CommandSurfaceKind = "frontend" | "harness" | "procedure";
type CommandExecutionMode = "frontend" | "harness" | "defaultConversation" | "directProcedure";
```

Each command descriptor should carry at least:

- `name`
- `description`
- `inputHint?`
- `surfaceKind`
- `executionMode`
- `frontendVisibility` or equivalent

The important rule is:

- **frontend-only** commands should never need a `Procedure`
- **harness** commands should be explicit, not encoded as procedure exceptions
- **procedures** should remain the only commands managed by the procedure registry

## Recommended implementation phases

### Phase 1: Audit and classify all built-in command surfaces

Create an explicit inventory of current commands and assign each to one of the three categories.

At minimum, audit:

- frontend commands in `src/tui/commands.ts`
- built-in procedures registered in `src/procedure/registry.ts`
- service-side routing in `src/core/service.ts`
- any command-specific UI affordances in the TUI controller

Expected result:

- `/dark`, `/light` => frontend-only
- `/model` => harness
- `/new` / `/quit` / `/exit` / `/end` => likely frontend-only control commands
- `/tokens` and similar built-ins => classify deliberately rather than implicitly

### Phase 2: Introduce shared command metadata

Create a small shared command-surface module that becomes the source of truth for command classification.

Goals:

- stop duplicating command identity between TUI-only lists and procedure registration
- make command kind and execution mode visible in code review
- allow frontends to render grouped command help/autocomplete without guessing

This phase should not change behavior yet beyond wiring metadata through.

### Phase 3: Separate frontend-only commands from procedures cleanly

Refactor `src/tui/commands.ts` so it only declares frontend-only commands and frontend affordances.

For commands like `/model`:

- keep the TUI affordance (`plain /model opens picker`)
- but stop treating it as a frontend-local command definition
- instead, reference shared harness-command metadata

Result:

- frontend-only commands live in one place
- harness/procedure commands come from shared command metadata and/or the registry

### Phase 4: Formalize harness-command routing in the service

Replace the current service rule:

- “slash command + non-default procedure + not harness execution mode”

with an explicit route decision based on command classification.

The service should decide:

1. frontend-only commands should never arrive here
2. harness commands execute locally in the harness
3. procedures follow their declared execution path

That logic should live behind a helper with a name that expresses intent, such as:

- `resolveCommandExecutionPlan(...)`
- `classifyCommandRoute(...)`
- `shouldDispatchProcedureThroughDefaultConversation(...)`

### Phase 5: Unify discoverability and autocomplete

Update the TUI command palette/autocomplete/help surfaces to present commands by category.

Desired outcome:

- frontend controls are clearly marked as local UI commands
- harness commands are shown as session/runtime commands
- procedures are shown as actual executable slash procedures

This will reduce confusion around commands like `/model`, which are currently surfaced next to frontend toggles even though they belong to a different layer.

### Phase 6: Add classification-focused tests

Add tests that verify the taxonomy, not just individual behaviors.

Examples:

- frontend-only commands never reach `NanobossService.prompt()`
- harness commands never enter async procedure dispatch
- procedure commands still dispatch exactly as before
- autocomplete/help surfaces include the right commands in the right groups
- plain `/model` in the TUI still opens the picker while inline `/model <provider> <model>` remains a harness command

## Migration notes

- Preserve current user-facing command strings; this should be an internal formalization, not a rename.
- Avoid a broad “everything is a procedure” abstraction; it collapses distinctions that are actually useful.
- Avoid a broad “everything local is frontend-only” abstraction; `/model` is the counterexample.
- Keep the TUI picker behavior for `/model` as a frontend convenience layered on top of a harness command.

## Success criteria

This work is done when:

- every built-in command has an explicit category
- service routing is driven by explicit command metadata rather than ad hoc conditionals
- frontend-only commands are not represented as procedures
- harness commands are clearly distinct from procedures in code and tests
- `/model`, `/dark`, and `/light` each sit in the correct layer with no ambiguity
