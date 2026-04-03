# Plan: stop tests from leaking session artifacts into `~/.nanoboss`

## Problem

Many unit/integration tests exercise real nanoboss persistence paths. Today `getNanobossHome()` resolves from `process.env.HOME` and defaults to the real user home:

- `src/config.ts` → `getNanobossHome()` returns `join(process.env.HOME?.trim() || homedir(), ".nanoboss")`

That means any test that does not explicitly override `HOME` can write:

- `~/.nanoboss/sessions/*`
- `~/.nanoboss/current-session.json`
- `~/.nanoboss/logs/*`
- `~/.nanoboss/agent-logs/*`

We already have proof of leakage in the live machine state, e.g. a persisted session named `session-from-client`, which is a literal test fixture id used in unit tests.

## Goals

1. Tests must never write nanoboss artifacts into the real user home by default.
2. The isolation mechanism should be easy to apply consistently across all test files.
3. Existing tests that intentionally inspect persistence should keep working, but against temp storage.
4. CI should fail fast if a test accidentally targets the real `~/.nanoboss`.

## Recommended approach

### 1) Add an explicit nanoboss-home override

Add support for a dedicated override in config resolution:

- prefer `process.env.NANOBOSS_HOME`
- otherwise fall back to `join(process.env.HOME ?? homedir(), ".nanoboss")`

That gives tests a precise knob without needing to repoint the entire process home directory.

Suggested target:

- `src/config.ts`

Why this is better than `HOME`-only overrides:

- less collateral impact on unrelated code that also reads `HOME`
- easier to reason about in tests
- easier to assert and guard in a shared test helper

### 2) Install a global test harness that always uses a temp nanoboss home

Create a shared test setup file that runs before test files and:

- creates a temp directory
- sets `process.env.NANOBOSS_HOME` to that temp dir
- optionally also sets `process.env.HOME` to a temp dir for tests that still implicitly rely on HOME-backed behavior
- cleans up after the test process exits

This should be the default for the whole suite, not opt-in per file.

Possible implementation options:

- Bun preload / test bootstrap file
- a shared `tests/helpers/test-env.ts` imported by test entrypoints

Preferred direction:

- one suite-wide preload so individual test authors do not need to remember to isolate storage

### 3) Convert ad hoc HOME overrides to the shared helper

A number of tests already manually override `HOME`. Those should be migrated to use the shared isolation helper or the new `NANOBOSS_HOME` override consistently.

Targets to audit first:

- `tests/unit/stored-sessions.test.ts`
- `tests/unit/current-session.test.ts`
- `tests/unit/default-history.test.ts`
- any test creating `NanobossService`, `SessionStore`, or calling CLI/server entrypoints

Goal:

- remove bespoke environment juggling where possible
- keep only narrowly-scoped overrides when a test specifically wants to simulate different user homes

### 4) Add a guard that fails if tests point at the real home

Add a small assertion helper used by the global test setup, e.g.:

- compute the real user home via `homedir()`
- fail the test process if `getNanobossHome()` resolves under that real home while `NODE_ENV === "test"` / Bun test is running

This catches regressions early if someone adds a new persistence test without isolation.

Potential forms:

- runtime assertion in the test bootstrap
- optional assertion in `getNanobossHome()` when `process.env.BUN_TEST` or similar is set

Safer first step:

- keep the guard in test bootstrap rather than production code

### 5) Add a focused regression test

Add at least one regression test that verifies persistence goes to the isolated test directory and not the real `~/.nanoboss`.

Example shape:

- create a session with explicit test fixture id
- assert the resulting `session.json` exists under `process.env.NANOBOSS_HOME`
- assert no corresponding path was created under the real user home

This should cover the exact class of leakage we already observed.

### 6) One-time cleanup guidance for existing leaked artifacts

After isolation lands, document a manual cleanup step for already leaked local artifacts.

Examples:

- remove known test fixture sessions such as `session-from-client`
- optionally provide a small script to list suspicious session ids (fixture names, temp cwd paths, empty sessions with no cells/jobs)

This cleanup should be separate from the behavior fix.

## Rollout order

1. Add `NANOBOSS_HOME` support in `src/config.ts`
2. Add suite-wide test bootstrap that assigns temp `NANOBOSS_HOME`
3. Migrate persistence-heavy tests off custom HOME handling where possible
4. Add regression test + bootstrap guard
5. Clean up known leaked artifacts locally

## Risks / watchouts

- Some tests may implicitly depend on persisted state surviving across separate helper-created services in the same process. The shared temp home must remain stable for the duration of a test file/process.
- Tests spawning subprocesses must inherit `NANOBOSS_HOME`, otherwise child processes may still leak to the real home.
- Any code path that bypasses `getNanobossHome()` and manually constructs `~/.nanoboss` paths should be audited and removed.

## Success criteria

- Running `bun test` does not create or modify files under the real `~/.nanoboss`
- test fixture session ids no longer appear in the real session store
- persistence-oriented tests continue to pass using isolated temp storage
