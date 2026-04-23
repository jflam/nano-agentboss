# Cross-package duplicate helper sweep plan

## Purpose

Review and simplify duplicate helper families that survived package extraction.
This is the second package review target from
`plans/2026-04-23-package-review-roadmap.md`, after the TUI extension stack.

The desired outcome is one owner per helper behavior, with package imports
following that ownership and tests preventing duplicate implementations from
reappearing.

## Current state

### Duplicate helper families

Known duplicate or near-duplicate implementations:

| Helper family | Current locations | Owner hypothesis |
| --- | --- | --- |
| `inferDataShape` / `stringifyCompactShape` | `packages/store/src/data-shape.ts`, `packages/procedure-engine/src/data-shape.ts`, embedded copy in `packages/app-runtime/src/memory-cards.ts` | Move to the lowest package that can represent procedure result shapes without runtime policy, likely `@nanoboss/procedure-sdk` unless Phase 1 proves this is store-owned persistence metadata. |
| `summarizeText` | `packages/procedure-sdk/src/text.ts`, `packages/store/src/text.ts`, `packages/agent-acp/src/text.ts` | Keep `@nanoboss/procedure-sdk` as canonical owner and import it from store and agent-acp. |
| `formatErrorMessage` | `packages/procedure-sdk/src/error-format.ts`, `packages/store/src/error-format.ts` | Keep `@nanoboss/procedure-sdk` as canonical owner and import it from store. |
| `normalizeToolInputPayload` / `normalizeToolResultPayload` | `packages/app-runtime/src/tool-payload-normalizer.ts`, `packages/adapters-tui/src/tool-payload-normalizer.ts` | Pick a non-UI owner for adapter-neutral tool payload normalization, then keep TUI card formatting local to `@nanoboss/adapters-tui`. |
| `resolveSelfCommand` | `packages/procedure-engine/src/self-command.ts`, `packages/adapters-http/src/self-command.ts`, `packages/adapters-mcp/src/self-command.ts`, local variant in `packages/agent-acp/src/runtime-capability.ts` | Centralize command resolution in the lowest package that legitimately owns process entrypoint discovery, likely `@nanoboss/app-support` unless Phase 1 proves it should remain procedure-engine-owned. |

### Existing guardrails

`tests/unit/procedure-engine-helper-convergence.test.ts` already prevents some
old root and procedure-engine helper copies from returning. It does not yet
cover all duplicate helper families listed above, and it does not enforce a
single owner for tool payload normalization, data shape inference, or
self-command resolution across adapter packages.

## Desired package boundaries

### Canonical helper owners

Canonical owners should be selected by dependency direction:

- Prefer `@nanoboss/procedure-sdk` for pure procedure/result contracts that have
  no runtime, persistence, or adapter policy.
- Prefer `@nanoboss/app-support` only for low-level process, filesystem, or
  workspace support primitives that are not procedure-specific.
- Prefer `@nanoboss/store` only for persistence-specific metadata behavior.
- Do not use `@nanoboss/app-runtime` as a general helper owner; keep it focused
  on orchestration and policy.
- Do not use adapters as helper owners unless the helper is protocol-specific
  presentation or translation.

### Consumers

Consumers should import public package APIs instead of copying implementation
files. If a helper is intentionally not shared, the reason must be documented
and guarded by a test so a future duplicate with the same name is not mistaken
for drift.

## Proposed review phases

### Phase 1: inventory behavior and choose owners

Actions:

- For each helper family, list every implementation, public export, package
  dependency, and repo consumer.
- Compare behavior, not just names. Capture exact differences such as
  `formatErrorMessage` fallback behavior and `inferDataShape` truncation marker
  differences.
- Decide the canonical owner for each family and document the dependency graph
  impact before editing imports.
- Identify any public exports that need a temporary re-export for compatibility.

Acceptance:

- Produce an owner decision table with consumer evidence and a concrete import
  migration path for all five helper families.
- Confirm the proposed owners keep
  `tests/unit/package-dependency-direction.test.ts` acyclic.

### Phase 2: converge pure text, error, and data-shape helpers

Likely implementation:

- Keep `summarizeText` and `formatErrorMessage` canonical in
  `@nanoboss/procedure-sdk`.
- Replace store and agent-acp local helper implementations with imports from
  the canonical owner.
- Move or re-home `inferDataShape` and `stringifyCompactShape` based on Phase 1,
  then update store, procedure-engine, and app-runtime memory-card consumers.
- Preserve existing behavior with focused tests before deleting duplicate
  files.

Acceptance:

- No duplicate `summarizeText` or `formatErrorMessage` implementation remains
  outside the canonical owner.
- `inferDataShape` has one canonical implementation and all current data-shape
  call sites import it.
- Existing result, session-store, memory-card, and procedure-engine recovery
  tests continue to pass.

### Phase 3: converge tool payload normalization

Likely implementation:

- Choose one canonical owner for adapter-neutral tool payload normalization.
- Move `ToolPayloadIdentity`, normalized payload shape, input normalization,
  result normalization, and tool error extraction to that owner when they are
  not UI-specific.
- Update `@nanoboss/app-runtime` tool-call previews and
  `@nanoboss/adapters-tui` tool-card formatting to import the shared
  normalizer.
- Keep TUI-only card layout, colors, truncation, and render decisions in
  `@nanoboss/adapters-tui`.

Acceptance:

- Only one implementation of `normalizeToolInputPayload` and
  `normalizeToolResultPayload` remains.
- App-runtime and TUI tests show the same raw tool payloads produce the same
  normalized headers, text, lines, and paths as before.
- No adapter imports a higher-level package solely to reach a helper.

### Phase 4: converge self-command resolution

Likely implementation:

- Centralize `resolveSelfCommand` and its runtime-testable variant in the owner
  selected during Phase 1.
- Update procedure-engine worker dispatch, HTTP adapter registration, MCP
  adapter registration, and agent-acp runtime capability construction to import
  the shared resolver.
- Preserve `NANOBOSS_SELF_COMMAND`, source-entrypoint detection, Bun virtual
  filesystem behavior, and packaged command behavior.
- Keep protocol-specific command assembly in the adapter packages.

Acceptance:

- Only one implementation of `resolveSelfCommand` and source-entrypoint
  detection remains.
- Existing procedure-engine self-command tests cover the canonical owner or are
  moved to the owner package.
- HTTP, MCP, procedure dispatch worker, and agent-acp runtime capability tests
  cover their protocol-specific use of the shared resolver.

### Phase 5: add duplicate-helper guardrails

Actions:

- Extend `tests/unit/procedure-engine-helper-convergence.test.ts` or add a new
  package-helper ownership test that scans repository TypeScript files for
  duplicate helper implementation names.
- Add explicit allowed-owner metadata for each helper family.
- Update dependency-direction allowed layering only where canonical owner
  imports require it.
- Update package public barrels so canonical helpers are exported intentionally
  and non-owner packages do not re-export accidental helper surfaces.

Acceptance:

- The known helper families cannot reappear in multiple package owners without
  editing the guardrail test and documenting the reason.
- Package dependency-direction validation remains acyclic.
- Public barrels expose helper APIs only from their canonical owner or from a
  deliberate compatibility re-export with a removal note.

## Test strategy

Run focused checks during the review:

```sh
bun test packages/procedure-sdk packages/store packages/agent-acp
bun test packages/procedure-engine packages/app-runtime packages/adapters-tui
bun test packages/adapters-http packages/adapters-mcp
bun test tests/unit/procedure-engine-helper-convergence.test.ts
bun test tests/unit/package-dependency-direction.test.ts
```

Run before commit:

```sh
bun run check:precommit
```

## Risks

- Choosing `@nanoboss/app-support` for too many helpers could turn it into a
  general utility bucket. Use it only when the helper is genuinely low-level and
  not procedure-specific.
- Moving `inferDataShape` may alter serialized data-shape previews if the
  current copies are not exactly equivalent.
- Tool payload normalization is shared behavior, but UI rendering is not. The
  move must not pull TUI presentation policy into a lower package.
- Self-command resolution is sensitive to development, packaged, and override
  execution modes. Tests should cover all existing branches before deleting
  copies.

## Out of scope

- Redesigning tool-card visuals or runtime event schemas.
- Changing stored session metadata format beyond preserving existing
  data-shape output.
- Changing adapter protocol behavior except where it imports the shared
  self-command resolver.
- Introducing a new general utilities package.

## Final acceptance criteria

- Each known duplicate helper family has exactly one canonical implementation
  or a documented, tested reason for multiple implementations.
- All consumers import helpers from the canonical owner through public package
  APIs.
- Duplicate-helper guardrails prevent the same helper families from drifting
  across packages again.
- `bun run check:precommit` passes.
