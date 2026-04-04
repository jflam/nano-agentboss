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

# 2026-03-31 Unified RunResult, Cell Refs, and Discovery Spec

## Goal

Make prior results reusable in later turns **without** re-pasting large outputs into prompt context.

The model should stay simple for command authors:

- a session is an ordered list of **immutable cells**
- each cell stores `data`, `display`, `stream`, and `summary`
- later work refers to prior results by **cell/path references**
- both `callAgent(...)` and `callProcedure(...)` return the **same shape**
- typed agent calls use `jsonType<T>()`

This fixes the current problem:

> a procedure can print useful output, but later turns cannot reliably access it as machine-readable state.

---

## The core model

### Cells

A session contains immutable cells.

```ts
interface CellRecord {
  cellId: string;
  procedure: string;
  input: string;
  output: {
    data?: KernelValue;
    display?: string;
    stream?: string;
    summary?: string;
  };
  meta: {
    createdAt: string;
    parentCellId?: string;
    kind: "top_level" | "procedure" | "agent";
  };
}
```

### References

Public references are simple:

```ts
interface CellRef {
  sessionId: string;
  cellId: string;
}

interface ValueRef {
  cell: CellRef;
  path: string; // e.g. "output.data", "output.display", "output.data.critique"
}
```

So the public model is just:

- **whole run** → `CellRef`
- **something inside a run** → `ValueRef`

Internally, large values can still be stored as files/artifacts. That is an implementation detail, not the public API.

### Kernel values

```ts
type KernelScalar = null | boolean | number | string;

type KernelValue =
  | KernelScalar
  | CellRef
  | ValueRef
  | KernelValue[]
  | { [key: string]: KernelValue };
```

---

## One result shape for both `callAgent` and `callProcedure`

This is the main simplification.

```ts
interface RunResult<T extends KernelValue = KernelValue> {
  cell: CellRef;
  data?: T;            // convenience value for the current caller
  dataRef?: ValueRef;  // canonical persisted machine result
  displayRef?: ValueRef;
  streamRef?: ValueRef;
  summary?: string;
  rawRef?: ValueRef;   // optional; mainly useful for agent calls/debugging
}
```

### Meaning

- `cell` = the whole child run
- `data` = already-read machine result for this caller's convenience
- `dataRef` = the canonical durable reference to `output.data`
- `displayRef` = durable reference to `output.display`
- `streamRef` = durable reference to `output.stream`
- `rawRef` = optional raw output reference if we want it for agent calls

### Important rule

`data` is a convenience field.

`dataRef` is the canonical persisted result.

That means we do **not** need a separate `immediate` concept anymore.

---

## Procedure shape

```ts
interface Procedure {
  name: string;
  description: string;
  inputHint?: string;
  execute(prompt: string, ctx: CommandContext): Promise<ProcedureResult>;
}

interface ProcedureResult<T extends KernelValue = KernelValue> {
  data?: T;
  display?: string;
  summary?: string;
}
```

Recommended interpretation:

- `data` = small machine-readable manifest of what matters
- `display` = what the user should see
- `summary` = short discovery string for later search/listing

In practice, `data` should usually contain:

- small scalars
- small objects/arrays
- `CellRef`
- `ValueRef`
- small summaries plus refs

It should usually **not** contain giant markdown blobs.

---

## Public API

## `callAgent(...)`

```ts
callAgent(prompt: string, options?: CommandCallAgentOptions): Promise<RunResult<string>>;
callAgent<T>(
  prompt: string,
  type: TypeDescriptor<T>,
  options?: CommandCallAgentOptions,
): Promise<RunResult<T>>;
```

## `callProcedure(...)`

```ts
callProcedure<T extends KernelValue = KernelValue>(
  name: string,
  prompt: string,
): Promise<RunResult<T>>;
```

## `ctx.print(...)`

```ts
print(text: string): void;
```

Meaning:

- stream progress / user-visible text
- also persist it as `output.stream`
- not the canonical result channel

## `jsonType<T>()`

```ts
const CritiqueResultType = jsonType<CritiqueResult>();
```

Use this to define typed agent responses without handwritten schema boilerplate.

## Generic ref operations

```ts
ctx.refs.read(valueRef)
ctx.refs.stat(valueRef)
ctx.refs.writeToFile(valueRef, path)
```

## Discovery operations

```ts
ctx.session.last()
ctx.session.recent({ procedure?: string; limit?: number })
```

These should return lightweight metadata, not giant payloads.

Example shape:

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

---

## Examples first

These examples are the most important part of this spec.

## Example 1: typed agent call

```ts
const critique = await ctx.callAgent(prompt, CritiqueResultType);

if (critique.data?.verdict === "flawed") {
  ctx.print("The answer needs revision\n");
}

return {
  data: {
    critique: critique.dataRef,
    verdict: critique.data?.verdict,
  },
  display: renderCritique(critique.data),
  summary: `Critique verdict: ${critique.data?.verdict}`,
};
```

How to read this:

- `critique.data` is convenient for the currently running procedure
- `critique.dataRef` is the durable reference to the full result
- the returned `data` stores only a ref plus a small scalar summary

## Example 2: bad shape

```ts
return {
  data: {
    critique: critique.data,
  },
};
```

If `critique.data` is large, this pollutes persisted state and makes later prompt construction harder.

Preferred shape:

```ts
return {
  data: {
    critique: critique.dataRef,
    verdict: critique.data?.verdict,
  },
};
```

## Example 3: `/second-opinion`

```ts
const CritiqueResultType = jsonType<CritiqueResult>();

export default {
  name: "second-opinion",
  description: "Get a Claude answer, then ask Codex to critique it",
  async execute(prompt, ctx) {
    const firstPass = await ctx.callAgent(buildClaudePrompt(prompt), {
      agent: { provider: "claude", model: "opus" },
      stream: false,
    });

    const critique = await ctx.callAgent(
      "Critique the referenced answer `answer` and return a critique object.",
      CritiqueResultType,
      {
        agent: { provider: "codex", model: "gpt-5.4" },
        stream: false,
        refs: {
          answer: firstPass.dataRef,
        },
      },
    );

    return {
      data: {
        subject: prompt,
        answer: firstPass.dataRef,
        critique: critique.dataRef,
        verdict: critique.data?.verdict,
      },
      display: renderSecondOpinion(firstPass.data, critique.data),
      summary: `second-opinion: ${prompt} (${critique.data?.verdict})`,
    };
  },
};
```

Important design choice:

- `output.data` is a **small discovery manifest**
- later procedures can inspect it to find the important refs

## Example 4: calling another procedure

```ts
const review = await ctx.callProcedure("second-opinion", prompt);

return {
  data: {
    reviewCell: review.cell,
    reviewResult: review.dataRef,
    reviewDisplay: review.displayRef,
  },
  summary: "Ran second-opinion",
};
```

How to read this:

- `review.cell` points at the whole child run
- `review.dataRef` points at the child `output.data`
- `review.displayRef` points at the child `output.display`
- `review.data` is already available if the caller wants it now

## Example 5: write the last display to a file

```ts
const last = await ctx.session.last();

if (!last?.displayRef) {
  return { display: "No previous display found." };
}

await ctx.refs.writeToFile(last.displayRef, "output.md");

return {
  display: "Wrote the last display to output.md",
};
```

No markdown needs to be re-pasted into a prompt.

## Note on ad hoc follow-ups

Ad hoc follow-ups like:

- "write the second opinion critique for foo to foo-critique.md"
- "compare the last two second opinions"
- "summarize the harshest prior critique"

are an important use case, but the session/MCP layer for those flows is intentionally deferred to the companion spec:

- `plans/2026-03-31-session-mcp-spec.md`

This core spec stays focused on the cell/ref model and the procedure-facing API.

---

## Discovery principle

`output.data` should be treated as the **discovery surface** for later procedures and later agent turns.

That means procedures should return `data` shaped like a small manifest:

```ts
{
  subject: "foo",
  critique: ValueRef(...),
  verdict: "mixed"
}
```

not like a giant output blob.

Good `data` makes later automation easy.

Bad `data` forces later procedures or agents to scrape displays or re-run work.

---

## Procedure scope

Saved procedures should be used for reusable workflows with deterministic orchestration, such as:

- `/second-opinion`
- `/linter`
- `/commit`

One-off follow-ups over prior session state are important, but they belong to the later session/MCP layer rather than the core procedure API.

---

## Pure function model vs mutable session state

Yes: once we introduce mutable session state, we are outside a pure function model.

That adds real complexity.

## Recommended v1 model

Use **immutable cells only**.

That means:

- each prompt execution creates a new immutable cell
- cells are never mutated after completion
- later work refers to prior cells by `CellRef` / `ValueRef`
- discovery happens through `last()` / `recent()` + small `output.data` manifests

Conceptually:

```txt
(prompt, referenced cells) -> new cell
```

That is much easier to reason about than arbitrary mutable session memory.

## Do we need mutable session bindings in v1?

Recommendation: **no**.

Mutable names like:

- `current_draft`
- `review_a`
- `review_b`

may be convenient later, but they are not required for the core model.

The immutable cell/ref model is enough to support:

- follow-up queries
- exporting prior outputs
- comparing earlier runs
- passing prior results to new agents

So v1 should avoid general mutable session bindings.

## What about per-call named references?

Those are still useful and safe.

Example:

```ts
await ctx.callAgent("Summarize `review_display`", {
  refs: {
    review_display: review.displayRef,
  },
});
```

These `refs` exist only for the duration of one call. They are not mutable session state.

## Out of scope for v1

This spec does **not** include the session/context MCP layer.

The v1 scope here is limited to:

- immutable cells
- `CellRef` / `ValueRef`
- `RunResult<T>`
- discovery via `last()` / `recent()` + `output.data`

The later MCP layer is described separately in:

- `plans/2026-03-31-session-mcp-spec.md`

---

## Implementation plan

## Phase 1: unify types around `RunResult<T>`

### `src/types.ts`

- add `CellRef`
- add `ValueRef`
- define `KernelValue` in terms of scalars, refs, arrays, objects
- add `ProcedureResult<T>`
- add `RunResult<T>`
- change `Procedure.execute(...)` to return `Promise<ProcedureResult>`
- change `callAgent(...)` to return `Promise<RunResult<T>>`
- change `callProcedure(...)` to return `Promise<RunResult<T>>`
- rename per-call `bindings` to `refs`

## Phase 2: persist runs as cells

### `src/server.ts`

- create a cell for each top-level prompt
- persist:
  - `output.data`
  - `output.display`
  - `output.stream`
  - `output.summary`
- expose discovery helpers:
  - `session.last()`
  - `session.recent(...)`

### `src/context.ts`

- make `callProcedure(...)` create a child cell/span
- return `RunResult<T>`
- keep `ctx.print(...)` as streaming output plus stream capture

## Phase 3: make agent calls also produce child cells

### `src/call-agent.ts`

- persist parsed result as child cell `output.data`
- persist raw output as `output.stream` or `rawRef` path
- return `RunResult<T>`
- keep typed parsing behavior

This is the main symmetry point:

- calling an agent produces a child cell
- calling a procedure produces a child cell
- both return `RunResult<T>`

## Phase 4: add `jsonType<T>()`

### new helper, likely in `src/types.ts` or a dedicated file

- generate schema + validator from `T`
- replace handwritten descriptor boilerplate in commands

## Phase 5: add generic ref operations

- `ctx.refs.read(valueRef)`
- `ctx.refs.stat(valueRef)`
- `ctx.refs.writeToFile(valueRef, path)`

Internally these may read from files/artifacts, but the public model remains cell/path based.

## Phase 6: migrate built-in commands

### `commands/default.ts`

- return `ProcedureResult`
- persist pass-through response as `display`

### `commands/second-opinion.ts`

- replace handwritten descriptor with `jsonType<CritiqueResult>()`
- return a small discovery manifest in `data`
- use `display` for the rendered final answer
- include `subject` in the manifest so later procedures can identify the right run

### `commands/linter.ts`

- return structured machine result in `data`
- keep progress in `stream`
- use `callProcedure("commit", ...)` and consume `RunResult<T>`

### `src/create.ts`

- teach generated procedures to:
  - use `jsonType<T>()`
  - keep `data` small and ref-heavy
  - treat `data` as a discovery manifest
  - return `ProcedureResult`

---

## Success criteria

This design is successful if all of the following become true:

1. `/second-opinion` can be followed by “write the last output to output.md” without repasting content.
2. A procedure can pass a previous result to another agent by reference.
3. `callProcedure(...)` composes over structured machine results rather than printed strings.
4. `callAgent(...)` and `callProcedure(...)` both return the same `RunResult<T>` shape.
5. Later turns can discover the right prior artifact by inspecting recent cell manifests rather than scraping giant displays.
6. Command authors can use typed agent outputs with `jsonType<T>()`.
7. Large prior outputs do not automatically pollute future prompts.

---

## Recommendation

Implement **immutable cell history + unified `RunResult<T>`** first.

Do **not** start with general mutable session state.

If later we find that users truly need aliases like `current_draft`, that can be added as a thin optional layer on top of immutable cell references. But it should not be the foundation of the model.
