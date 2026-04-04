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

# 2026-04-01 Plan: Session MCP XPath-like Helpers

## Status

Proposed, not yet implemented.

Related plans:

- `plans/2026-03-31-session-mcp-spec.md`
- `plans/2026-03-31-multi-turn-session-history-and-result-context-plan.md`
- `plans/2026-04-01-procedure-result-memory-mcp-plan.md`

---

## Problem

`SessionStore` persists execution as an append-only cell log with `parentCellId` links for nested procedure and agent calls.

That means the underlying data already has structure, but the current public query surface is mostly flat:

- `session_last()`
- `session_recent({ procedure?, limit? })`
- `cell_get(cellRef)`
- `ref_read(valueRef)`

This is enough for recency-based lookups, but it is awkward for questions that are naturally structural:

1. find the top-level run that owns this nested `callAgent`
2. find all nested calls made by a given `/second-opinion` run
3. find the nearest ancestor procedure matching a name
4. search only within one top-level run's subtree instead of the last N cells globally

The result is that models and procedures reason about a tree-shaped execution history through log-shaped helpers, which encourages bounded-scan overclaiming and makes composition harder to inspect safely.

---

## Goal

Add a small set of **XPath-like session MCP helpers** that expose the existing parent/child structure directly without replacing the underlying append-only storage model.

Desired outcome:

1. keep `SessionStore` persistence simple and durable
2. make structural queries first-class in MCP
3. let procedures reason about top-level runs, nested procedures, and agent calls as a tree
4. preserve current flat helpers for simple recency lookups

---

## Non-goals

- Do not replace the append-only cell log with a graph-native storage format.
- Do not introduce multi-parent DAG semantics in this change.
- Do not expose a full general-purpose query language in the first version.
- Do not change memory-card behavior to include nested cells by default.

---

## Design stance

This should be **tree-aware, not DAG-native**.

Today each cell has at most one `parentCellId`, which matches the semantics of:

- top-level procedure run
- nested procedure call
- nested agent call

That is a tree. If future provenance needs true multi-parent relationships, that can be added later as explicit edges layered on top. This plan only makes the existing tree easier to query.

---

## Proposed helper surface

Add structural helpers to the session MCP API and keep the current flat helpers unchanged.

### 1. `cell_parent`

Input:

- `cellRef`

Returns:

- the parent `CellSummary` or exact `CellRecord`
- `undefined` if the cell is top-level

Primary use:

- walk upward from a nested procedure or agent cell

### 2. `cell_children`

Input:

- `cellRef`
- optional `kind`
- optional `procedure`
- optional `limit`

Returns:

- direct children in creation order

Primary use:

- inspect one step of expansion under a top-level run

### 3. `cell_ancestors`

Input:

- `cellRef`
- optional `limit`
- optional `includeSelf`

Returns:

- ordered ancestor chain from nearest parent outward

Primary use:

- "find the containing `/second-opinion` run"
- "find nearest ancestor where `procedure === review`"

### 4. `cell_descendants`

Input:

- `cellRef`
- optional `kind`
- optional `procedure`
- optional `maxDepth`
- optional `limit`

Returns:

- descendants in deterministic traversal order

Primary use:

- inspect all nested work below one top-level run

### 5. `top_level_runs`

Input:

- optional `procedure`
- optional `limit`

Returns:

- only cells with `meta.kind === "top_level"`

Primary use:

- align MCP queries with the user's chat mental model

### 6. `find_cells`

Input:

- optional `procedure`
- optional `kind`
- optional `rootCellRef`
- optional `hasData`
- optional `limit`

Returns:

- matching `CellSummary[]`

Primary use:

- one bounded search helper that can operate either globally or within a subtree

This should stay intentionally narrow. It is the closest thing to "XPath" in the first version, but it is still a structured filter API rather than a free-form query language.

---

## Storage and indexing changes

Keep persisted cell files unchanged.

Add in-memory indexes in `SessionStore` after load:

1. `parentByCellId: Map<string, string | undefined>`
2. `childrenByCellId: Map<string, string[]>`
3. optional cached list of top-level cell ids

These indexes should be built both:

- when existing cells are loaded from disk
- when a new cell is finalized

This preserves file compatibility while making structural lookups cheap and deterministic.

---

## API semantics

### Ordering

Be explicit about ordering rules:

- `recent()` remains reverse chronological
- `cell_children()` returns creation order
- `cell_ancestors()` returns nearest-first
- `cell_descendants()` should choose one documented traversal order and keep it stable

Recommendation: use depth-first pre-order for descendants because it maps well to "execution expansion under this run."

### Bounds and diagnostics

Avoid the same ambiguity that caused the earlier critique.

Structural helpers should:

- apply explicit limits only when requested
- document when results are truncated
- never imply "not found anywhere" when they only searched a bounded subset

If truncation metadata is easy to add, return something like:

- `items`
- `truncated`
- `scanned`

instead of a bare array for the more search-like helpers

### Exactness

Tree navigation helpers should be exact with respect to the loaded session:

- parent/child/ancestor relationships are not heuristic
- only bounded search helpers should have partial-result semantics

---

## MCP surface changes

Update `src/session-mcp.ts` to:

1. add new `SessionMcpApi` methods
2. expose new tool definitions in `listSessionMcpTools()`
3. parse arguments and dispatch in `callSessionMcpTool(...)`
4. keep existing tools stable for backward compatibility

Also update tool descriptions so downstream agents understand the difference between:

- recency queries
- exact cell/ref dereferencing
- structural tree traversal

---

## Model instruction and prompt guidance

This change needs **usage guidance for the model**, not just new MCP methods.

The best place to do that is the existing prompt-preparation path that already injects session-memory guidance for `/default` turns:

- `prepareDefaultPrompt(...)`
- `renderSessionToolGuidance()`

Do not rely only on MCP tool names or descriptions to teach strategy. The model should receive a compact "when to use which tool" block whenever prior session history is relevant.

### Guidance layering

Use two complementary layers:

1. **Tool-local descriptions in MCP**
   - define exact semantics
   - describe whether a tool is recency-based, structural, or exact dereference
   - document truncation/bounds behavior where applicable

2. **Prompt-side usage recipe**
   - tell the model how to choose tools
   - provide canonical retrieval flows
   - warn against overclaiming from bounded scans

### Guidance content

Expand the session guidance block so it teaches a decision tree along these lines:

- use `top_level_runs(...)` when the user is asking about prior chat-visible commands such as `/default`, `/linter`, or `/second-opinion`
- use `session_recent(...)` only for recency-based discovery across the whole session; it is not a structural query
- use `cell_children(...)` or `cell_descendants(...)` to inspect nested procedure or agent calls under a run
- use `cell_parent(...)` or `cell_ancestors(...)` to identify which top-level run owns a nested cell
- after finding a candidate cell, use `cell_get(...)` for exact metadata and `ref_read(...)` for exact stored values
- if a stored value contains nested refs, follow them with additional `ref_read(...)` calls
- do not treat "not found" from a bounded search as proof of absence unless the query scope was exhaustive
- prefer session MCP tools over direct filesystem inspection

### Instruction style

Keep the prompt guidance:

- short
- procedural
- recipe-oriented rather than descriptive
- explicit about failure modes

The model does not need an XPath tutorial. It needs a compact set of retrieval patterns it can apply reliably.

### Tests

Update prompt-bridge tests to assert that, when structural helpers exist, the injected guidance mentions:

- top-level discovery vs structural traversal
- ref-following for nested refs
- the warning against treating bounded scans as exhaustive

---

## Type changes

Likely additions in `src/types.ts`:

- optional lightweight structural result types for traversal/search responses
- shared option types for kind/procedure/limit filters

Prefer small reusable option/result types over hand-rolled per-method inline objects once the shape is clear.

---

## Tests

Add focused tests around a mixed session:

1. top-level `/review`
2. child procedure under `/review`
3. nested `callAgent` under that child or directly under `/review`
4. another unrelated top-level run

Cover:

- parent lookup from nested cells
- children lookup on top-level and intermediate cells
- ancestors order and stopping behavior
- descendants filtering by `kind` and `procedure`
- top-level-only listing
- bounded search within one subtree vs global recency
- persistence round-trip after reload

---

## Rollout order

1. Add SessionStore indexes and traversal helpers.
2. Add MCP API methods and tool definitions.
3. Add tests for exact structure traversal.
4. Add or update guidance text so models know when to use structural helpers instead of `session_recent(...)`.
5. Revisit memory-card and review flows to replace flat bounded scans where structural scope is the right primitive.

---

## Open questions

1. Should tree helpers return full `CellRecord`s, `CellSummary`s, or both depending on the tool?
   - Recommendation: default to `CellSummary` for traversal/listing and use `cell_get` for full payloads.

2. Should `find_cells` ship in v1, or should we start with only exact navigation helpers?
   - Recommendation: ship exact helpers first, then add `find_cells` only if they prove insufficient.

3. Do we want `rootCellRef` / `topLevelCellRef` explicitly returned on summaries?
   - Recommendation: not required for v1 if ancestor traversal is cheap, but it may be a good follow-up optimization.

---

## Recommended first cut

If we want the smallest useful change, implement only:

1. `top_level_runs`
2. `cell_parent`
3. `cell_children`
4. `cell_ancestors`
5. `cell_descendants`

That already gives us the essential "XPath-like" operations:

- parent axis
- child axis
- ancestor axis
- descendant axis
- chat-visible root enumeration

It also keeps the design honest: this is not full XPath, just a compact structural query layer over session cells.
