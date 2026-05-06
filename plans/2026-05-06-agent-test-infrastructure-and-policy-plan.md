# Agent test infrastructure and policy plan

Date: 2026-05-06

## Goal

Make validation cheap enough for agentic coding loops without weakening the
commit gate.

The desired steady state is:

- agents run no tests while only reading, planning, or editing documentation
- agents run narrow tests at coherent implementation boundaries
- agents run impacted package/root checks before handing off code changes
- full `bun run check:precommit` remains the commit gate for code, test,
  config, package, and build-system changes
- docs-only and plans-only changes do not trigger the full pre-commit suite
- `AGENTS.md` states this policy explicitly so agents stop treating every edit
  as a reason to run the most expensive command

## Current state

The refactor described in `docs/architecture.md` left the repo with much better
ownership boundaries:

- 14 workspace packages under `packages/*`
- 91 package-local test files
- 42 root unit test files
- 8 root e2e test files
- package dependency direction guarded by
  `tests/unit/package-dependency-direction.test.ts`
- root package scripts for package fan-out:
  `bun run test:packages` and `bun run typecheck:packages`

The current pre-commit command is `bun run check:precommit`, implemented by
`scripts/precommit-check.ts`. It runs these phases sequentially:

1. `lint`
2. `typecheck`
3. `typecheck:packages`
4. `knip`
5. `procedure-sdk:build`
6. `procedure-sdk:test:hermetic`
7. `test:packages`
8. `test`

The root `test` script uses `scripts/compact-test.ts`, which is already smarter
than raw `bun test` for root unit tests. It splits known root unit tests into
parallel, environment-sensitive, and heavy groups, and it can reuse exact
command/content/runtime cache hits from `.nanoboss/test-clean.json`.

The repo also has a broader pre-commit result cache in
`.nanoboss/pre-commit-checks.json`, keyed by:

- HEAD commit
- staged diff
- unstaged diff
- relevant untracked files
- Bun/platform/arch runtime
- command identity

That cache helps repeated exact reruns, but it does not solve the main agentic
loop problem: agents are invoking the full commit gate at the wrong boundaries.

## Analysis

### The largest policy problem

`AGENTS.md` currently says:

- after completing a task, run relevant pre-commit checks
- the repo's pre-commit validation command is `bun run check:precommit`
- if checks pass, commit immediately

That is good for final commit discipline, but it is underspecified for
mid-loop work and docs-only changes. Agents conservatively collapse "relevant
pre-commit checks" into "run the whole pre-commit command." For this repo, that
means a planning edit can trigger lint, two TypeScript passes, package fan-out,
knip, procedure-sdk packaging checks, all package tests, and all root unit
tests.

The policy should separate:

- **exploration**: no tests
- **documentation/planning edits**: no code tests
- **implementation checkpoints**: targeted tests only
- **handoff readiness**: impacted checks
- **commit gate**: full pre-commit only when the changed files can affect code
  behavior, package surfaces, build output, or tests

### The largest technical problem

`check:precommit` has no impacted-scope mode. It is a single ordered suite. That
is appropriate as a final gate, but it is too blunt for agents working inside a
known package boundary.

The refactor gave us enough information to do better:

- source files live in package-owned directories
- package tests live beside the packages they exercise
- package dependency direction is declarative
- root tests are now mostly architecture, root app, command, and e2e tests

The missing piece is a validation selector that maps changed files to the
smallest useful command set.

### Redundant checks inside pre-commit

The current `procedure-sdk` phases duplicate work:

- `procedure-sdk:build` runs `cd packages/procedure-sdk && bun run build`
- `procedure-sdk:test:hermetic` runs `bun run build && bun run test &&
  bun run typecheck:consumer`
- `test:packages` also runs `packages/procedure-sdk`'s `bun test`

So the SDK build can run twice, and SDK package tests can run once in the
hermetic phase and once in package fan-out. The hermetic boundary matters, but
the duplication does not.

Recommended change:

- keep one SDK dist build phase
- replace `procedure-sdk:test:hermetic` with a consumer/dist verification phase
  that assumes the previous build output
- let `test:packages` own SDK package tests

### Root and package tests have different optimization needs

Root unit tests are already compacted and partially partitioned by
`scripts/compact-test.ts`.

Package tests are currently run package-by-package with
`NANOBOSS_PACKAGE_TASK_CONCURRENCY`, but package selection is all-or-nothing.
For a change in `packages/store/src`, agents should not need to run every
adapter package test in the middle of implementation. They should normally run:

- `cd packages/store && bun test`
- `cd packages/store && bun run typecheck`
- tests/typechecks for dependent packages only when the changed surface is
  public or when the final handoff boundary requires impacted coverage

### Exact-command caching is useful but too coarse

The existing test-clean cache is an exact command cache. It is safe and simple,
but it cannot answer coverage questions such as:

- this package test pass already covers the changed package
- a full package fan-out pass already subsumes one package test
- docs-only edits should not invalidate a code-test pass
- a root architecture test pass should remain relevant if only unrelated docs
  changed

Do not replace the exact cache first. Add impact-aware command selection first.
Then extend caching only where it preserves simple safety properties.

## Recommendation

Prioritize the work in this order:

1. Update `AGENTS.md` with explicit test boundaries.
2. Add phase timing output to `scripts/precommit-check.ts` and package fan-out.
3. Remove duplicate procedure-sdk pre-commit work.
4. Add a `validate:changed` command that selects checks from changed files.
5. Teach agents to use `validate:changed` for implementation checkpoints and
   reserve `check:precommit` for code-affecting commit gates.
6. Add impact-aware cache/subsumption only after the selector is stable.

This order gives an immediate behavior win from policy, a low-risk runtime win
from removing duplicate checks, and then a durable technical path for scoped
validation.

## Proposed `AGENTS.md` policy

Replace the current test guidance with a boundary-based policy like this:

```md
## Validation policy

- Use Bun commands in this repository.
- Do not run tests while only reading, searching, or planning.
- Do not run code tests for docs-only or plans-only edits.
- Do not run `bun run check:precommit` in the middle of implementation work.
- For implementation checkpoints, run the narrowest command that covers the
  files just changed:
  - package source/test change: `cd packages/<name> && bun test`
  - package type/API change: `cd packages/<name> && bun run typecheck`
  - root unit behavior change: `bun run test:unit <test-file>`
  - command/procedure change: run the directly related root unit test file
  - e2e-sensitive adapter/runtime change: run the relevant `bun run test:e2e
    <test-file>` before handoff
- Before committing code, tests, package manifests, build scripts, or validation
  infrastructure, run `bun run check:precommit`.
- For docs-only or plans-only commits, skip `bun run check:precommit` unless the
  user explicitly requests it or a docs validation command exists for the edited
  files.
- If `bun run check:precommit` passes, create the commit immediately.
```

After `validate:changed` exists, simplify the checkpoint guidance:

```md
- For implementation checkpoints, run `bun run validate:changed`.
- Use direct package/test-file commands only when narrowing a failure.
```

## Proposed command tiers

### Tier 0: no validation

Use when:

- reading files
- writing analysis in `plans/`
- editing docs only
- making comments or prompt text changes that are not shipped code

Command:

- none

### Tier 1: local checkpoint

Use after a coherent edit inside one package or one root command area.

Commands:

- `cd packages/<name> && bun test`
- `cd packages/<name> && bun run typecheck`
- `bun run test:unit tests/unit/<related>.test.ts`

This tier should finish quickly enough that agents can run it more than once
during implementation.

### Tier 2: impacted handoff

Use before handing off non-trivial code changes, especially public API,
architecture, adapter, runtime, or cross-package changes.

Command:

- `bun run validate:changed`

Expected behavior:

- compute changed files from staged, unstaged, and relevant untracked files
- map package-local changes to the owning package
- include dependent packages when the changed file is a package public entry,
  exported type, package manifest, tsconfig, or source file under a public
  surface
- include root architecture tests for package manifest, dependency, exports,
  and package-boundary changes
- include root command tests for `nanoboss.ts`, `src/commands/**`,
  `procedures/nanoboss/**`, and root support scripts
- include e2e smoke tests only for adapter/runtime paths with integration risk

### Tier 3: full commit gate

Use before committing code-affecting changes.

Command:

- `bun run check:precommit`

This stays exhaustive and conservative.

## `validate:changed` design

Add:

```json
{
  "scripts": {
    "validate:changed": "bun run scripts/validate-changed.ts"
  }
}
```

`scripts/validate-changed.ts` should:

1. collect changed paths from:
   - `git diff --name-only --cached`
   - `git diff --name-only`
   - `git ls-files --others --exclude-standard`
2. classify each path:
   - docs/plan only
   - root command/procedure/script
   - package source
   - package test
   - package manifest/config
   - root architecture/config/build
   - e2e-sensitive adapter/runtime
3. derive an impacted package set:
   - owning package for `packages/<name>/**`
   - reverse dependencies from the existing package dependency graph for public
     source, manifest, export, or type changes
4. derive root test files:
   - architecture tests for dependency/export/build-shape changes
   - procedure tests for `procedures/nanoboss/**`
   - command tests for root command changes
   - e2e tests only for explicitly mapped adapter/runtime paths
5. run commands in a deterministic order:
   - package typechecks for impacted packages
   - package tests for impacted packages
   - selected root unit tests through `scripts/compact-test.ts`
   - selected e2e tests through `scripts/compact-test.ts tests/e2e/...`
6. print the selected checks before running them, including why each was
   selected

The first version should prefer conservative over clever. If classification is
uncertain, fall back to `bun run check:precommit`.

## Impact mapping

Start with these mappings.

| Changed path | Local checkpoint | Handoff check |
| --- | --- | --- |
| `plans/**`, `docs/**`, `README.md` | none | none unless docs tooling exists |
| `packages/<pkg>/tests/**` | `cd packages/<pkg> && bun test <file>` | package test |
| `packages/<pkg>/src/**` private implementation | package test + package typecheck | owning package test/typecheck |
| `packages/<pkg>/src/index.ts`, exported types, `package.json`, `tsconfig*.json` | package test + package typecheck | owning package plus reverse-dependent package typechecks/tests |
| `packages/adapters-tui/**` | TUI package tests | TUI tests plus selected CLI/private-server e2e when runtime path changes |
| `packages/adapters-http/**` | HTTP package tests | HTTP package tests plus HTTP e2e when server/SSE behavior changes |
| `packages/adapters-mcp/**` | MCP package tests | MCP package tests plus MCP root/e2e coverage when tool protocol changes |
| `packages/app-runtime/**` | app-runtime package tests | app-runtime tests plus adapter tests for affected entry paths |
| `packages/procedure-engine/**` | engine package tests | engine tests plus runtime/procedure root tests for dispatch changes |
| `procedures/nanoboss/**` | related root unit test | related root unit tests plus package tests only when package APIs change |
| `scripts/precommit-check.ts`, `scripts/compact-test.ts`, `scripts/run-package-task.ts` | related root unit test | related root unit tests plus one dry selected command if practical |
| root `package.json`, `bun.lock`, `tsconfig.json`, `eslint.config.*` | none mid-edit | full `check:precommit` |

## Pre-commit optimization work

### Phase 1: timing instrumentation

Add `durationMs` to `phase_result` markers in `scripts/precommit-check.ts`.
Print a final phase table sorted by execution order.

Add package-level duration output to `scripts/run-package-task.ts`, for example:

```text
[@nanoboss/store] ok 1.2s
[@nanoboss/adapters-tui] ok 5.8s
```

Acceptance criteria:

- `bun run check:precommit` output shows each phase duration
- `bun run test:packages` output shows each package duration
- existing marker parsing still works for `nanoboss/pre-commit-checks`

### Phase 2: remove procedure-sdk duplication

Change `packages/procedure-sdk` scripts so the sealed consumer check can run
without rebuilding and retesting the package after pre-commit already did that.

One possible shape:

```json
{
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json --pretty false && cp -R dist/packages/procedure-sdk/src/. dist/ && rm -rf dist/packages",
    "test": "bun test",
    "verify:consumer": "cd test-fixtures/consumer && bun run typecheck",
    "verify:hermetic": "bun run build && bun run test && bun run verify:consumer"
  }
}
```

Then `scripts/precommit-check.ts` should run:

1. `procedure-sdk:build`
2. `procedure-sdk:verify:consumer`
3. `test:packages`

`verify:hermetic` remains available for humans who want the sealed SDK check in
one package-local command.

Acceptance criteria:

- pre-commit builds SDK dist once
- pre-commit runs SDK package tests once through `test:packages`
- consumer typecheck still proves the dist package boundary

### Phase 3: changed-file selector

Implement `scripts/validate-changed.ts` with the conservative mapping above.

Acceptance criteria:

- docs-only changes print "no code validation required" and exit zero
- single package test changes run only that package test
- public package API changes include reverse dependents
- root package/config changes fall back to full pre-commit
- selected commands are printed before execution

### Phase 4: package graph helper

Move package graph discovery into a shared test-support helper so
`validate-changed.ts` and `tests/unit/package-dependency-direction.test.ts`
derive from the same package manifests and allowed layering table.

Do not make this a runtime package. Keep it under `tests/` or `scripts/` until
there is a real product use.

Acceptance criteria:

- dependency-direction test and validation selector agree on package names
- reverse-dependent selection is covered by unit tests
- a package dependency edge change updates one table, not two unrelated copies

### Phase 5: AGENTS.md update

Install the policy from this plan into `AGENTS.md`.

Acceptance criteria:

- docs/plans-only work explicitly skips code tests and full pre-commit
- code work still requires final validation before commit
- `validate:changed` is the preferred implementation checkpoint command
- `check:precommit` remains the full code-affecting commit gate

### Phase 6: cache improvements

Only after `validate:changed` is stable, extend caching.

Possible safe additions:

- cache package test/typecheck passes by package, runtime, and package-relevant
  fingerprint
- treat a full package fan-out pass as satisfying a later single-package check
  if the package-relevant fingerprint is unchanged
- keep docs/plans changes out of package/root-unit cache keys
- retain the current exact-command cache as the fallback safety model

Acceptance criteria:

- cache hit messages name the command and fingerprint basis
- cache never reuses a package result after source, test, manifest, lockfile, or
  runtime changes that can affect that package
- disabling cache still works with one environment variable for debugging

## Tests for the infrastructure itself

Add focused unit coverage for:

- changed path classification
- package impact closure
- docs-only no-op validation
- public API change selecting reverse dependents
- uncertain path falling back to full pre-commit
- procedure-sdk pre-commit phase order
- phase duration marker compatibility

Use fixture repos where possible; do not make these tests depend on the current
dirty working tree.

## Rollout strategy

1. Land timing instrumentation first. It changes observability, not policy.
2. Land the procedure-sdk duplication cleanup as a small runtime win.
3. Land `validate:changed` in report-only mode for one commit: print selected
   commands and the equivalent full gate requirement, but do not let agents rely
   on it yet.
4. Enable `validate:changed` as the recommended checkpoint command.
5. Update `AGENTS.md`.
6. Review timing data after several real agent loops before adding cache
   subsumption.

## Non-goals

- Do not remove the full pre-commit gate for code-affecting commits.
- Do not run real-agent e2e tests by default.
- Do not make package graph selection a product runtime feature.
- Do not add a general monorepo task runner dependency unless the local script
  becomes hard to maintain.
- Do not let cache sophistication precede clear validation boundaries.

## Expected wins

Immediate wins:

- docs/plans edits stop paying the code-test tax
- agents stop running full pre-commit during implementation
- SDK pre-commit duplication is removed

Medium-term wins:

- package-local work validates at package speed
- public API changes validate only impacted reverse dependents before the final
  gate
- full pre-commit remains meaningful because it is reserved for commit
  readiness instead of being overused as a progress check

Long-term wins:

- timing data identifies the next slow packages/tests objectively
- package-relevant cache keys allow safe reuse even when unrelated docs or
  packages changed
- `AGENTS.md` becomes a source of operational discipline instead of an
  accidental instruction to over-test every edit
