# Root tests cleanup plan

## Purpose

The package-isolation work successfully established per-package `tests/`
directories and per-package `test`/`typecheck` scripts. The remaining work is
to shrink the root `tests/` tree without deleting coverage that still belongs
to the root application.

This plan answers the key boundary question explicitly:

- Yes, some root tests should remain.
- Tests for code that is still root-owned under `src/`, for root entrypoints
  such as `nanoboss.ts`, `resume.ts`, and `preload.ts`, for repo-local
  procedures under `procedures/` and `.nanoboss/procedures/`, and for
  cross-package integration / architecture coverage should stay at the repo
  root.
- Only tests whose behavior has clearly migrated into `packages/*/tests/`
  should be removed from `tests/unit/`.

## Current state

As of April 16, 2026:

- Per-package tests now exist under `packages/*/tests/` for the package-local
  suites moved by the package-isolation plan.
- The root still contains:
  - `tests/e2e/**`
  - fixtures and preload helpers under `tests/fixtures/` and `tests/preload-test.ts`
  - a mixed `tests/unit/` set containing:
    - root-owned app / CLI tests
    - architecture / convergence tests
    - repo-procedure tests
    - cross-package integration tests
    - a smaller set of likely package-era leftovers
- The remaining root-owned `src/` surface is:
  - `src/app-support/build-freshness.ts`
  - `src/commands/doctor.ts`
  - `src/commands/http-options.ts`
  - `src/commands/http.ts`
  - `src/dev/build-size-report.ts`
  - `src/options/frontend-connection.ts`
  - `src/options/resume.ts`
  - `src/util/argv.ts`
  - `src/util/compact-test.ts`

## Permanent root test surface

These categories stay at the root unless the production code itself moves out
of the root:

### 1. Root-owned `src/` tests

These continue to validate code that still lives under `src/`:

- `tests/unit/argv.test.ts`
- `tests/unit/build-freshness.test.ts`
- `tests/unit/build-size-report.test.ts`
- `tests/unit/cli-options.test.ts`
- `tests/unit/compact-test.test.ts`
- `tests/unit/doctor.test.ts`
- `tests/unit/http-server-options.test.ts`
- `tests/unit/resume-options.test.ts`

### 2. Root entrypoint / preload tests

These cover top-level files outside `packages/`:

- `tests/unit/nanoboss.test.ts`
- `tests/unit/resume.test.ts`
- `tests/unit/test-home-isolation.test.ts`

### 3. Repo procedure tests

These exercise repo-local procedures and should stay root-owned while those
procedures remain outside `packages/`:

- `tests/unit/autoresearch-command.test.ts`
- `tests/unit/create-procedure.test.ts`
- `tests/unit/execute-plan.test.ts`
- `tests/unit/knowledge-base-commands.test.ts`
- `tests/unit/linter.test.ts`
- `tests/unit/model-command.test.ts`
- `tests/unit/pre-commit-checks.test.ts`
- `tests/unit/research-command.test.ts`
- `tests/unit/simplify-command.test.ts`
- `tests/unit/simplify2-command.test.ts`

### 4. Architecture / convergence tests

These are intentionally root-scoped because they inspect multiple packages and
the repo layout:

- `tests/unit/app-support-helper-convergence.test.ts`
- `tests/unit/delete-remaining-src-core.test.ts`
- `tests/unit/package-dependency-direction.test.ts`
- `tests/unit/procedure-engine-helper-convergence.test.ts`
- `tests/unit/public-package-entrypoints.test.ts`
- `tests/unit/repo-helper-convergence.test.ts`
- `tests/unit/root-owned-core-relocation.test.ts`
- `tests/unit/store-helper-convergence.test.ts`

### 5. Cross-package integration tests

These remain at the root unless they can be rewritten to target a single
package through public entrypoints only:

- `tests/unit/context-call-agent-session.test.ts`
- `tests/unit/default-history.test.ts`
- `tests/unit/frontend-events.test.ts`
- `tests/unit/mcp-server.test.ts`
- `tests/unit/prompt-input.test.ts`
- `tests/unit/procedure-dispatch-jobs.test.ts`
- `tests/unit/service.test.ts`
- `tests/unit/ui-cli.test.ts`

### 6. End-to-end coverage

All of `tests/e2e/**` stays at the root.

## Candidate cleanup set

These were the first files to audit for safe removal or final relocation because
they appear to be package-scoped or close to package-scoped:

- `tests/unit/acp-runtime.test.ts`
- `tests/unit/acp-updates.test.ts`
- `tests/unit/json-type.test.ts`
- `tests/unit/registry.test.ts`
- `tests/unit/repo-artifacts.test.ts`
- `tests/unit/repo-fingerprint.test.ts`

These are intentionally only candidates, not automatic deletions:

- `acp-runtime.test.ts` and `acp-updates.test.ts` import only from
  `@nanoboss/agent-acp` today, so they are strong relocation candidates.
- `json-type.test.ts` imports only from `@nanoboss/procedure-sdk`, so it is a
  strong relocation candidate.
- `registry.test.ts` exercises `@nanoboss/procedure-catalog`, so it is a strong
  relocation candidate.
- `repo-artifacts.test.ts` and `repo-fingerprint.test.ts` initially targeted
  `procedures/lib/*`; that behavior has now been moved into
  `@nanoboss/app-support`, which made package-boundary relocation safe.

## Checked-in manifest

Cleanup status after implementation:

### keep-root-owned

- `tests/unit/app-support-helper-convergence.test.ts`
- `tests/unit/argv.test.ts`
- `tests/unit/autoresearch-command.test.ts`
- `tests/unit/build-freshness.test.ts`
- `tests/unit/build-size-report.test.ts`
- `tests/unit/cli-options.test.ts`
- `tests/unit/compact-test.test.ts`
- `tests/unit/context-call-agent-session.test.ts`
- `tests/unit/create-procedure.test.ts`
- `tests/unit/default-history.test.ts`
- `tests/unit/delete-remaining-src-core.test.ts`
- `tests/unit/doctor.test.ts`
- `tests/unit/execute-plan.test.ts`
- `tests/unit/frontend-events.test.ts`
- `tests/unit/http-server-options.test.ts`
- `tests/unit/knowledge-base-commands.test.ts`
- `tests/unit/linter.test.ts`
- `tests/unit/mcp-server.test.ts`
- `tests/unit/model-command.test.ts`
- `tests/unit/nanoboss.test.ts`
- `tests/unit/package-dependency-direction.test.ts`
- `tests/unit/pre-commit-checks.test.ts`
- `tests/unit/procedure-dispatch-jobs.test.ts`
- `tests/unit/procedure-engine-helper-convergence.test.ts`
- `tests/unit/prompt-input.test.ts`
- `tests/unit/public-package-entrypoints.test.ts`
- `tests/unit/repo-helper-convergence.test.ts`
- `tests/unit/research-command.test.ts`
- `tests/unit/resume-options.test.ts`
- `tests/unit/resume.test.ts`
- `tests/unit/root-owned-core-relocation.test.ts`
- `tests/unit/root-test-boundary.test.ts`
- `tests/unit/service.test.ts`
- `tests/unit/simplify-command.test.ts`
- `tests/unit/simplify2-command.test.ts`
- `tests/unit/store-helper-convergence.test.ts`
- `tests/unit/test-home-isolation.test.ts`
- `tests/unit/ui-cli.test.ts`

### candidate-relocate

Validated and removed from root in this batch:

- `tests/unit/acp-updates.test.ts`
  - replacement: `packages/agent-acp/tests/updates.test.ts`
  - proof: imports only from `@nanoboss/agent-acp`; replacement preserves
    assistant notice parsing and raw text collection assertions
- `tests/unit/acp-runtime.test.ts`
  - replacement: `packages/agent-acp/tests/runtime-guard.test.ts`
  - proof: imports only from `@nanoboss/agent-acp`; replacement preserves the
    blocked `~/.nanoboss` access rules and allowed scoped access assertions
- `tests/unit/json-type.test.ts`
  - replacement: `packages/procedure-sdk/tests/json-type.test.ts`
  - proof: imports only from `@nanoboss/procedure-sdk`; replacement preserves
    typia-backed schema/validator behavior plus the runtime misuse guard
- `tests/unit/registry.test.ts`
  - replacement: `packages/procedure-catalog/tests/registry.test.ts`
  - proof: imports only from `@nanoboss/procedure-catalog`; replacement keeps
    disk loading, persistence, metadata projection, builtin exposure, and lazy
    realization coverage at the package boundary
- `tests/unit/repo-artifacts.test.ts`
  - replacement: `packages/app-support/tests/repo-artifacts.test.ts`
  - proof: helper behavior moved from `procedures/lib/repo-artifacts.ts` into
    `@nanoboss/app-support`; replacement preserves atomic write and file seeding
    behavior at the package boundary
- `tests/unit/repo-fingerprint.test.ts`
  - replacement: `packages/app-support/tests/repo-fingerprint.test.ts`
  - proof: helper behavior moved from `procedures/lib/repo-fingerprint.ts` into
    `@nanoboss/app-support`; replacement preserves stable hashing, change
    detection, excluded directory behavior, and transient `.tmp-*` exclusion

### candidate-delete-after-validation

No remaining files in this bucket after moving repo helpers into
`@nanoboss/app-support`.

## Safety rules

### Rule 1: no delete-first cleanup

Do not delete a root test because a similarly named package test exists. Delete
only after proving that the behavior is covered at the package boundary or is
no longer required.

### Rule 2: validate behavior, not filenames

For each candidate root test, list the concrete assertions or scenarios it
covers. Map each scenario to one of:

- an existing package test file and test case
- a new package test that must be added first
- a root-owned test that should stay

If a scenario cannot be mapped, the root test is not ready for deletion.

### Rule 3: package tests must stay package-scoped

A migrated test may move into `packages/<name>/tests/` only if it imports the
package under test through `@nanoboss/<name>` plus other declared workspace
dependencies. If it reaches into root `src/`, root procedures, or sibling
package internals, it stays at the root.

### Rule 4: remove in small batches

Delete one package-family or one small candidate set at a time. Avoid a single
bulk deletion PR for the whole root `tests/` tree.

## Execution plan

### Phase 1: freeze the keep-list

Create a checked-in manifest in the cleanup PR description or plan notes that
splits the current root tests into:

- `keep-root-owned`
- `candidate-relocate`
- `candidate-delete-after-validation`

The manifest should be derived from the lists above, not from ad hoc judgment
while deleting files.

### Phase 2: write per-file migration proofs

For each candidate file:

1. Record what public API or helper it exercises.
2. Record whether that code now lives in a package or still in root-owned
   code.
3. Record the destination package test file, or explain why it remains root-owned.
4. Add any missing package assertions before removing the root file.

This proof can live in the PR description or as brief notes in the plan while
the cleanup is active.

### Phase 3: validate candidate replacements

Before deleting a candidate root file, run:

1. The candidate root test by itself.
2. The relevant package test file or package test suite.
3. `bun run test:packages`
4. `bun run test`
5. `bun run typecheck`
6. `bun run typecheck:packages`

The deletion is safe only if the package suite still proves the same behavior
and the full repo gates stay green.

### Phase 4: delete only validated leftovers

After the proof and validation steps pass:

- delete the root candidate test
- keep the package test that replaced it in the same change
- mention the replacement explicitly in the commit message or PR summary

If a root test is partly package-local and partly integration coverage, split
it first instead of deleting it outright.

### Phase 5: tighten the root test boundary

After the first cleanup batch lands, add a lightweight guard that documents the
intended root test categories. This can be either:

- a short section in `plans/README.md` or repo docs, or
- a small architecture test that asserts root `tests/unit/` files belong to an
  approved category

The goal is to stop drift back into “everything goes in root `tests/`”.

## Suggested cleanup order

Use the lowest-risk sequence first:

1. `acp-updates.test.ts`
2. `acp-runtime.test.ts`
3. `json-type.test.ts`
4. `registry.test.ts`
5. `repo-fingerprint.test.ts` and `repo-artifacts.test.ts` only after deciding
   whether the source of truth is `@nanoboss/app-support` or `procedures/lib/`

## Done criteria

This cleanup is complete when:

- every remaining root test clearly belongs to a root-owned, integration,
  architecture, or e2e category
- package-local behavior is covered only in `packages/*/tests/`
- no root test is kept merely because “it was already there”
- the full repo test and typecheck gates still pass
