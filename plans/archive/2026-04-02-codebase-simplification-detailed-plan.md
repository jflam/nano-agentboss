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

# 2026-04-02 Codebase Simplification Detailed Plan

## Problem statement

The codebase has accumulated multiple overlapping ways to perform the same session-inspection work, plus a transport split and a few explicit compatibility branches that no longer look architecturally necessary.

The main simplification target is not storage or core capability. It is surface area:

- too many user-facing ways to retrieve similar session data
- more than one transport path for session MCP
- duplicated tool-definition logic
- explicit backward-compatibility branches and aliases
- result-shape aliases that make the stored type less truthful than the runtime behavior

The repo appears to have little or no external user pressure to preserve all current entrypoints, so this plan assumes deletion is preferable to compatibility unless a real consumer is identified.

---

## Proposed end state

1. **One canonical session-MCP transport.**
   Keep the transport the runtime actually uses and delete the contradicted path.

2. **One canonical session-inspection surface.**
   MCP tools become the primary public API for session traversal and retrieval.

3. **One source of truth for tool definitions.**
   Tool schema, parsing, description, and implementation live in one registry and are reused anywhere else they need to surface.

4. **No compatibility-only branches unless a real dependency exists.**
   Legacy config fields, duplicate CLI aliases, and extra result-field names are removed.

5. **Public and stored types describe reality.**
   Aliases such as `rawRef` and `critiqueMainIssue` are either removed or made semantically distinct.

---

## Guiding principles

1. **One concept, one path.**
   Near-equivalent helpers should be collapsed into one primitive rather than preserved for convenience.

2. **Delete before abstracting.**
   Prefer removing dead or redundant paths before adding wrapper layers.

3. **Keep the storage model; simplify the surface model.**
   The session store can remain stable while APIs and prompts get smaller.

4. **Documentation must follow the actual runtime.**
   Any plan item that changes behavior must update architecture docs, prompts, and examples in the same pass.

5. **Compatibility is opt-in, not assumed.**
   If no concrete consumer is known, remove the shim.

---

## Workstream 1: Canonicalize session-MCP transport

### Goal

Remove the contradiction between runtime wiring, test coverage, and architecture documentation by choosing one transport and deleting the other.

### Recommended direction

Default to **keeping stdio** and removing the HTTP transport, because:

- the current attachment path already builds stdio servers
- both the one-shot agent path and default-session path already depend on that helper
- the `session-mcp` command already exposes stdio behavior
- removing HTTP is a smaller simplification than re-plumbing all attachment code to HTTP

If there is a real external dependency on HTTP, flip the decision and make HTTP canonical instead. The important part is to keep only one path.

### Scope

- `src/mcp-attachment.ts`
- `src/call-agent.ts`
- `src/default-session.ts`
- `src/session-mcp-stdio.ts`
- `src/session-mcp-http.ts`
- `nanoboss.ts`
- `tests/unit/session-mcp-stdio.test.ts`
- `tests/unit/session-mcp-http.test.ts`
- `docs/architecture.md`

### Concrete steps

1. Decide canonical transport explicitly.
2. Remove the non-canonical transport implementation and its tests.
3. Rename or simplify transport helpers so the remaining code does not imply multiple interchangeable transports.
4. Make disposal/lifecycle code match the actual transport that exists.
5. Rewrite architecture docs to describe the surviving path only.
6. Update CLI entrypoints so only supported transport commands remain exposed.

### Exit criteria

- only one session-MCP transport implementation remains
- lifecycle helpers no longer refer to transport variants that do not exist
- tests cover only the surviving transport
- docs describe the same transport the runtime uses

---

## Workstream 2: Collapse session-inspection to one public surface

### Goal

Stop maintaining the same session-inspection feature set as both MCP tools and slash procedures with separate behavior and parsing logic.

### Recommended direction

Make **MCP tools** the canonical surface.

Preferred end state:

- keep `top_level_runs`
- keep `session_recent`
- keep `cell_ancestors`
- keep `cell_descendants`
- keep `cell_get`
- keep `ref_read`
- keep `ref_stat`
- keep `ref_write_to_file`
- keep `get_schema`

Delete or derive any slash-command equivalents from that registry rather than maintaining parallel implementations.

### Scope

- `src/session-mcp.ts`
- `src/session-tool-procedures.ts`
- `src/server.ts`
- `src/memory-cards.ts`
- `src/context.ts`
- any docs or prompt text that teach both spellings

### Concrete steps

1. Freeze the minimal supported retrieval vocabulary.
2. Remove slash procedures for tools that already exist in MCP, or regenerate them mechanically from the MCP registry.
3. Eliminate behavior drift, especially around `session_recent` and current-cell exclusion.
4. Update system guidance, memory cards, and metadata to teach only the canonical surface.
5. Remove stale examples, tests, or prompt snippets that still advertise duplicate spellings.

### Exit criteria

- one primary user-facing inspection surface exists
- all retrieval operations route through one implementation path
- prompt/docs no longer teach overlapping spellings as first-class APIs
- equivalent operations cannot diverge semantically

---

## Workstream 3: Unify tool-definition logic

### Goal

Stop defining schemas, parsers, and handlers twice for the same session operations.

### Recommended direction

Treat `SESSION_MCP_TOOLS` as the canonical registry and derive any other exposure layers from it.

### Scope

- `src/session-mcp.ts`
- `src/session-tool-procedures.ts`
- `src/context.ts`
- `src/session-store.ts`

### Concrete steps

1. Inventory everything duplicated between the MCP tool table and slash-procedure table:
   - argument schema
   - argument coercion
   - cell-ref/value-ref parsing
   - tool descriptions
   - tool dispatch
2. Move any reusable parsing or formatting helpers into a shared layer only if they still matter after deletion.
3. Remove hand-written per-tool switch logic that simply mirrors the registry.
4. Keep `SessionStore` focused on data access and let one higher-level registry own exposure details.
5. Simplify `CommandSession` if it is only forwarding calls without adding meaningful semantics.

### Exit criteria

- session tools are declared in one canonical registry
- no second hand-maintained parser/dispatcher table exists for the same feature set
- adding or changing a tool requires touching one authoritative definition

---

## Workstream 4: Remove compatibility-only surfaces

### Goal

Delete code paths and docs that exist primarily to preserve old names or config shapes.

### Recommended direction

Assume compatibility shims should be removed unless a concrete in-repo or external caller is identified.

### Scope

- `src/mcp-registration.ts`
- `README.md`
- `package.json`
- any CLI or docs references to old names

### Concrete steps

1. Remove `legacyUrlField` handling if current config can standardize on one field name.
2. Remove duplicate script aliases such as `http` if they do not represent meaningfully different behavior.
3. Update README examples to show one supported invocation path only.
4. Search for any lingering "legacy", "deprecated", or alias branches and prune them in the same pass where safe.

### Exit criteria

- registration code accepts one documented config shape per concept
- package scripts expose one supported name per command path
- docs no longer advertise legacy aliases

---

## Workstream 5: Make result shapes truthful

### Goal

Remove output aliases that duplicate the same data or imply distinctions that do not exist.

### Recommended direction

- keep **one** issue field in `/second-opinion` output
- remove `rawRef` unless it becomes a genuinely separate stored artifact

### Scope

- `commands/second-opinion.ts`
- `src/session-store.ts`
- `src/types.ts`
- `tests/unit/default-memory-bridge.test.ts`
- `tests/unit/memory-cards.test.ts`
- `tests/e2e/second-opinion.test.ts`

### Concrete steps

1. Pick the canonical issue-field name for `/second-opinion`.
2. Update memory rendering, test fixtures, and downstream consumers to use that one name.
3. Decide whether `rawRef` has a real distinct meaning.
4. If not, remove it from stored types and persistence logic.
5. If yes, change storage so `rawRef` and `displayRef` are actually different artifacts and rename either field if needed for clarity.

### Exit criteria

- each concept has one authoritative field name
- stored result metadata matches actual runtime semantics
- tests assert on the surviving contract only

---

## Suggested execution order

### Phase 1: Transport decision and deletion

Do this first because it removes the clearest dead-path contradiction and simplifies later cleanup.

### Phase 2: Public surface reduction

Collapse session-inspection exposure to the canonical API while updating prompts and metadata.

### Phase 3: Registry unification

After the public surface is smaller, remove duplicated parser/dispatcher code and make one registry authoritative.

### Phase 4: Compatibility cleanup

Prune legacy config fields, script aliases, and old docs once the main architecture is settled.

### Phase 5: Result-shape cleanup

Finish with field and type cleanup, which becomes easier once the larger public surface has already been reduced.

---

## Verification checklist

For each phase:

- build succeeds
- relevant unit and e2e tests pass
- no docs or prompts still teach deleted names
- no dead files or tests remain for removed paths

For the final state:

- one transport
- one session-inspection surface
- one tool-definition registry
- no compatibility-only aliases without a documented consumer
- result types and persisted refs match actual behavior

---

## Risks and decisions to make up front

### 1. External consumers may exist outside the repo

The main uncertainty is whether any external automation depends on:

- the HTTP session-MCP server
- slash-command session inspection
- legacy MCP registration fields
- old result-field names

If those consumers exist, the plan should introduce a short deprecation window. If they do not, delete immediately.

### 2. Some helper overlap may be intentional for model ergonomics

If keeping multiple spellings is considered useful for prompting models, derive aliases mechanically from the canonical registry instead of maintaining them as independent implementations.

### 3. Doc and prompt drift is likely unless updated in the same pass

Any architectural deletion should include:

- runtime code
- tests
- prompt text
- docs
- examples

---

## Non-goals

- rewriting the underlying session-store persistence model
- redesigning cell storage formats from scratch
- adding new retrieval capabilities during the simplification pass
- preserving every current alias just because it already exists

---

## Definition of done

This simplification effort is complete when the codebase clearly answers these questions with one obvious path each:

- How does session MCP connect?
- How do users inspect prior runs and cells?
- Where is a session tool defined?
- Which config shape and command names are supported?
- Which output field name is the real one?

If any of those questions still has more than one first-class answer, the simplification pass is not done.
