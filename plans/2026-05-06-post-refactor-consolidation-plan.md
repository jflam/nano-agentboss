# Post-refactor consolidation plan

Date: 2026-05-06

## Goal

Turn the post-refactor follow-on work into a convergence pass.

The primary recommendation is consolidation: keep the package boundaries and
owner directories that now exist, but reduce thin helper modules, accidental
concepts, and unguarded intra-package import paths that make the codebase feel
larger than the design.

## Context

The architecture review behind `docs/architecture.md` found that Nanoboss now
has clearer ownership:

- explicit package entrypoints
- documented package responsibilities
- canonical helper ownership tests
- package dependency direction tests
- TUI implementation grouped by owner directory
- guarded relative import cycles across key implementation packages

The remaining concern is not that the architecture is wrong. The concern is
that the refactor increased source-file and navigation surface. The next pass
should default to folding weakly justified files into durable owners instead of
splitting more modules.

## Non-goals

- Do not restart a broad file-splitting campaign.
- Do not collapse package boundaries that now encode real ownership.
- Do not remove compatibility or resilience fallbacks just because they are
  alternate paths.
- Do not add broad validation gates before the current baseline can pass them.

## Workstream 1: consolidation inventory

Build an inventory of thin modules in the highest-surface packages:

- `packages/adapters-tui/src`
- `packages/app-runtime/src`
- `packages/procedure-engine/src`
- `packages/store/src`

Classify each candidate:

- **keep**: stable domain owner with an obvious reason to change independently
- **fold**: one-caller helper or routing bundle better owned by its caller
- **rename/move**: real concept with misleading ownership or location
- **guard**: acceptable shape that needs an import or ownership test

Start with modules called out by the review as likely wiring bundles:

- `app-runtime-wiring.ts`
- `app-controller-wiring.ts`
- `app-runtime-helpers.ts`
- `controller-initial-state.ts`
- `run-tty.ts`
- `dispatch/wait.ts`

Deliverable: an implementation checklist that names the files to keep, fold,
rename, move, or guard.

## Workstream 2: TUI directory import-layer guard

Add a TUI architecture test that encodes allowed import direction between owner
directories. The exact rule should follow the current implementation, but the
intended shape is:

- `run` may boot `app` and private-server/runtime dependencies
- `app` may wire `controller`, `views`, `overlays`, `clipboard`, and extensions
- `controller` may drive runtime calls and reducer inputs
- `reducer` may depend on `state` and event contracts
- `views` may depend on `state`, `components`, `core`, and `theme`
- `components` and `core` may depend on `theme`
- `state` should stay low-level and avoid depending upward on app/controller/view
  concerns

Deliverable: a failing test for new upward or sideways imports, with a focused
allowlist only where the current architecture requires it.

## Workstream 3: focused consolidation slices

Apply small consolidation slices from the inventory. Each slice should have one
clear reason:

- fold a one-caller helper into its durable owner
- merge duplicated lifecycle skeletons behind one local helper
- move a misplaced concept into the owner directory that already changes with it
- delete compatibility glue that is no longer referenced

Validation for each implementation checkpoint should use:

```text
bun run validate:changed
```

Before the final code commit, run:

```text
bun run check:precommit
```

Deliverable: a small sequence of commits, each reducing conceptual surface
without changing user-visible behavior.

## Workstream 4: adapter smoke coverage

Add adapter-level smoke tests for the behavior most likely to regress despite
architecture unit tests:

- full `nanoboss cli` private-server path
- ACP-server stdio path into `NanobossService`
- MCP async dispatch start/wait path through `NanobossRuntimeService`

Prefer smoke tests that assert protocol wiring and event flow over broad
end-to-end transcript assertions.

Deliverable: narrow adapter smoke tests that cover process/adapter/runtime
integration boundaries.

## Workstream 5: fallback classification guard

Keep the current fallback policy explicit. New fallback behavior should be one
of:

- persisted-data compatibility
- user-facing resilience
- tool-server convenience

Each new fallback should either carry a category and test coverage, or be
deleted. Existing classified fallbacks should stay until the compatibility or
resilience reason disappears.

Deliverable: a lightweight ownership test or documented pattern that prevents
uncategorized fallback paths from accumulating.

## Review order

1. Review this plan and adjust the consolidation criteria.
2. Run the consolidation inventory before editing implementation code.
3. Land the TUI import-layer guard early, so later cleanup has a stable target.
4. Apply consolidation slices package by package.
5. Add adapter smoke coverage after the import and ownership shape has settled.

## Success criteria

- Fewer one-caller helper modules in the highest-surface packages.
- TUI owner-directory imports are guarded by tests.
- New behavior has one obvious owner and one obvious import path.
- Adapter smoke tests cover the highest-risk runtime entry paths.
- `docs/architecture.md` remains a pure architecture reference, while this plan
  carries review-derived follow-on work.
