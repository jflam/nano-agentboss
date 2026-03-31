# 2026-03-31 Session MCP Spec

## Purpose

This is a companion spec to `plans/2026-03-31-kernel-handles-spec.md`.

The kernel/cell spec defines:

- immutable session history as cells
- `CellRef` and `ValueRef`
- `RunResult<T>`
- discovery through small `output.data` manifests

This spec describes a **later-phase MCP layer** that gives agents programmatic access to that session state for ad hoc follow-up tasks.

This MCP work is intentionally deferred until after the core cell/ref model exists.

---

## Why an MCP layer is useful

Saved procedures are great for reusable workflows like:

- `/second-opinion`
- `/linter`
- `/commit`

But many user requests are ad hoc and do not deserve permanent procedures in `commands/`.

Examples:

- "write the second opinion critique for foo to foo-critique.md"
- "compare the last two second opinions"
- "export the harshest critique"
- "summarize the display from the last run"

These are better handled by giving the agent a small session/context API via MCP.

---

## Design principle

Agents should be able to reason over prior cells directly through tools, rather than requiring a saved procedure for every one-off follow-up intent.

So the intended architecture is:

1. procedures create good cells with small discovery manifests in `output.data`
2. agents use MCP tools to inspect recent cells and follow refs
3. one-off user intents are handled directly through session tools
4. only reusable workflows are promoted to saved procedures

Generated procedures, if they exist, should be ephemeral by default and only persisted on explicit user request.

---

## Motivating example

Assume the session previously ran:

- `/second-opinion foo`
- `/second-opinion bar`
- `/second-opinion baz`

Each `second-opinion` cell returns a small manifest like:

```ts
{
  subject: "foo",
  answer: ValueRef(...),
  critique: ValueRef(...),
  verdict: "mixed"
}
```

Now the user says:

> write the second opinion critique for foo out to foo-critique.md

The intended MCP-driven flow is:

1. list recent `second-opinion` cells
2. inspect each cell's `output.data`
3. find the one whose `subject` is `foo`
4. follow the nested `critique` ref
5. write that ref to `foo-critique.md`

The key point is that the agent learns about `critiqueRef` by reading prior manifests, not through hidden magic and not by scraping giant display text.

---

## Example tool flow

Illustrative tool usage:

```txt
session_recent(procedure="second-opinion", limit=20)
→ [cell summaries]

ref_read(candidate.dataRef)
→ { subject: "foo", critique: ValueRef(...), verdict: "mixed" }

ref_write_to_file(manifest.critique, "foo-critique.md")
```

---

## Proposed MCP surface

Minimum useful tools:

### Discovery

- `session_last()`
- `session_recent(procedure?: string, limit?: number)`
- `cell_get(cellRef)`

### Ref operations

- `ref_read(valueRef)`
- `ref_stat(valueRef)`
- `ref_write_to_file(valueRef, path)`

That is intentionally small.

---

## Suggested tool semantics

### `session_recent(...)`

Returns lightweight metadata only:

```ts
interface CellSummary {
  cell: CellRef;
  procedure: string;
  summary?: string;
  dataRef?: ValueRef;
  displayRef?: ValueRef;
  streamRef?: ValueRef;
  createdAt: string;
}
```

### `ref_read(valueRef)`

Reads the value at a cell/path reference.

### `ref_stat(valueRef)`

Returns lightweight information such as:

- type
- size
- preview
- path
- originating cell

### `ref_write_to_file(valueRef, path)`

Materializes a referenced value to a workspace file.

---

## Scope and deferral

This MCP layer should be a **later phase**.

It depends on the core kernel/cell work being in place first:

- immutable cells
- `CellRef`
- `ValueRef`
- `RunResult<T>`
- discovery manifests in `output.data`

So this spec should not expand the first implementation slice unnecessarily.

---

## Success criteria

This MCP layer is successful if an agent can satisfy ad hoc requests like:

- export the critique for `foo`
- compare the last two `second-opinion` runs
- summarize a prior display by reference

without requiring new saved procedures in `commands/`.
