# Pre-commit-checks and commit fingerprint plan

Date: 2026-04-09

## Goal

Introduce two repo-specific procedures that work as a pair:

- `nanoboss/pre-commit-checks`
- `nanoboss/commit`

For v1, this should stay purely in the procedure layer.

That means:

- no generic nanoboss core feature
- no new `src/core/*` fingerprint/cache module
- no cache awareness added to `scripts/compact-test.ts`

This work should also supersede the existing top-level `commit` procedure for this repo.

So the implementation should:

- add `nanoboss/pre-commit-checks`
- add `nanoboss/commit`
- remove the current top-level `commit` procedure implementation and registration for this repo

The procedures should share one repo-specific workspace fingerprint and one repo-specific cache file so they can avoid rerunning the same validation command when the workspace has not changed.

---

## Feedback-driven constraints

### 1. Keep this out of nanoboss core

This is not a platform feature yet. It is a repo-local workflow optimization for this repo’s commit flow.

So the implementation should live under `procedures/nanoboss/`, for example:

- `procedures/nanoboss/pre-commit-checks.ts`
- `procedures/nanoboss/commit.ts`
- `procedures/nanoboss/test-cache-lib.ts`

If this later proves valuable across repos, we can generalize it then. Not in v1.

### 2. `nanoboss/commit` and `nanoboss/pre-commit-checks` must be designed together

The current plan had too much duplicated lookup logic in both procedures.

For v1, `nanoboss/commit` should delegate to `nanoboss/pre-commit-checks` instead of reimplementing check selection or cache lookup itself.

That keeps one source of truth for:

- which validation command runs
- how the workspace fingerprint is computed
- how cache hits are decided
- how cached output is replayed

### 3. This supersedes the repo’s top-level `commit`

This repo-specific workflow should replace the existing top-level `commit` procedure for this repo.

The intent is not to support both flows in parallel.

After this change, the repo-specific commit flow should live under the `nanoboss/*` package.

### 4. Use `compact-test`, not raw `bun test`

The repo’s commit-time validation command should be the compact wrapper, because raw `bun test` is too noisy.

So the command for v1 should be a single repo-defined constant, currently:

`bun run scripts/compact-test.ts`

If we want to swap that later to `bun run test` or another repo-defined command, we should do it in one shared procedure-local constant so both procedures stay aligned.

### 5. Cache retention should be single-entry for v1

The previous plan assumed a growing list of cached entries. That is unnecessary for the workflow you described.

For v1, the cache should store only the last fresh non-cached run of the one pre-commit validation command.

So:

- cache hits do not append anything
- a fresh run overwrites the previous stored record
- the cache file does not grow over time except for the size of the one stored output blob

This matches the intended workflow and removes the need for pruning logic.

---

## Product behavior

## Procedure 1: `nanoboss/pre-commit-checks`

Purpose:

- run the repo’s pre-commit validation command
- or replay the last fresh result if the workspace is unchanged

For v1, the command is:

`bun run scripts/compact-test.ts`

Behavior:

1. compute the current workspace fingerprint
2. compute the runtime fingerprint
3. load the single cached record
4. if the cached record matches the current workspace + runtime + command, replay its stored output and return its exit code
5. otherwise run the command for real, capture full output, and overwrite the cache with that fresh result

Optional escape hatch:

- `--refresh` or equivalent prompt flag should force a real rerun and overwrite the cache

## Procedure 2: `nanoboss/commit`

Purpose:

- create a commit only after the current workspace has a passing pre-commit-check result

Behavior:

1. invoke `nanoboss/pre-commit-checks`
2. if it returns a failing result, stop
3. if it returns a passing result, continue with commit creation

Important design point:

`nanoboss/commit` should not do its own cache lookup in parallel with `nanoboss/pre-commit-checks`.

It should rely on `nanoboss/pre-commit-checks` as the sole authority for:

- cache hit vs miss
- replayed vs fresh output
- pass/fail status for the current workspace

That is the cleanest way to ensure the two procedures actually work together instead of merely sharing ideas.

---

## Fingerprint model

We still need a deterministic identity for the current dirty workspace state, but it should remain procedure-local code.

For v1:

```text
workspaceStateFingerprint = hash(
  headCommit,
  stagedDiffHash,
  unstagedDiffHash,
  untrackedRelevantFilesHash
)
```

### Components

#### `headCommit`

Source:

- `git rev-parse HEAD`

#### `stagedDiffHash`

Source:

- hash of `git diff --cached --binary HEAD`

#### `unstagedDiffHash`

Source:

- hash of `git diff --binary`

#### `untrackedRelevantFilesHash`

Source:

- deterministic list of untracked, non-ignored files plus contents

For v1, keep the policy simple:

- include ordinary untracked files
- exclude `.git/`, `node_modules/`, `.nanoboss/`, `dist/`, `coverage/`, and obvious temp files

This is enough to invalidate the cache when staged, unstaged, or newly-created relevant files change.

---

## Runtime fingerprint

For v1, derive from:

- `Bun.version`
- `process.platform`
- `process.arch`

This keeps us from replaying a cached result across materially different runtimes.

---

## Command identity

Because `nanoboss/commit` and `nanoboss/pre-commit-checks` are supposed to operate together, v1 should use one fixed validation command, not a family of commands.

So we do not need a multi-entry command cache in v1.

We still persist the command string in the cache record so mismatches are explicit, but the intended model is:

- one repo-defined command
- one last fresh result

If later we add scoped variants like `nanoboss/pre-commit-checks tests/unit/foo.test.ts`, that would be a separate design step.

---

## Cache semantics

The cache should store the full previous fresh result, including failures.

That means:

- a previous pass can be replayed as a pass
- a previous failure can be replayed as a failure

This is still correct because the cache is keyed to the exact workspace state and runtime.

### Cache file

Suggested location:

- `.nanoboss/pre-commit-checks.json`

### Cache shape

```ts
interface CachedPreCommitChecksResult {
  version: 1;
  command: string;
  workspaceStateFingerprint: string;
  runtimeFingerprint: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  summary: string;
  createdAt: string;
  durationMs: number;
}
```

There is no `entries[]` list in v1.

The file stores just one record:

- the last fresh run of the repo’s pre-commit validation command

### Replay policy

Replay only when all of these match:

- `command`
- `workspaceStateFingerprint`
- `runtimeFingerprint`

On cache hit:

- print an explicit cache-hit header
- replay stored output
- return stored exit code

On cache miss:

- run the command
- overwrite the cache with the fresh result
- return the fresh exit code

### Retention

The cache should not grow.

For v1:

- cache hit: do not rewrite
- fresh run: overwrite previous record
- refresh run: overwrite previous record

So the only retained data is one result blob.

---

## Procedure interaction design

This is the key adjustment to make the two procedures actually fit together.

### `nanoboss/pre-commit-checks` owns validation state

`nanoboss/pre-commit-checks` should return structured data along these lines:

```ts
interface PreCommitChecksResult {
  command: string;
  cacheHit: boolean;
  exitCode: number;
  passed: boolean;
  workspaceStateFingerprint: string;
  runtimeFingerprint: string;
  createdAt: string;
}
```

It should also print the replayed or fresh command output for the human/agent.

### `nanoboss/commit` consumes `nanoboss/pre-commit-checks`

`nanoboss/commit` should:

1. call `ctx.callProcedure("nanoboss/pre-commit-checks", promptOrFlags)`
2. inspect the returned typed result
3. stop if `passed === false`
4. otherwise proceed with the commit flow

This eliminates drift between the procedures.

If we later change:

- the command
- the fingerprint inputs
- the cache file
- the refresh behavior

we change it once in `nanoboss/pre-commit-checks`.

---

## Implementation outline

### Procedure-local shared helper

Add a helper module under `procedures/nanoboss/`, for example:

- `procedures/nanoboss/test-cache-lib.ts`

Responsibilities:

- expose the repo-defined validation command constant
- compute workspace fingerprint
- compute runtime fingerprint
- read/write the single cache file
- run the command and capture output
- decide hit vs miss

This is shared by procedures, but it is still repo-local procedure code, not nanoboss core.

### `procedures/nanoboss/pre-commit-checks.ts`

Responsibilities:

- parse `--refresh` if present
- call the shared helper
- print cache-hit or fresh-run header
- replay or print command output
- return typed result data

### `procedures/nanoboss/commit.ts`

Responsibilities:

- call `nanoboss/pre-commit-checks`
- stop on failure
- perform the repo-specific commit flow once checks pass
- make the agent prompt explicit that checks already ran and do not need to be rerun

The current top-level `commit` procedure already delegates commit authoring to `ctx.callAgent(...)`.
That basic approach can stay, but it should move into `nanoboss/commit` and be gated by `nanoboss/pre-commit-checks`.

### Remove the old top-level `commit`

This work should also remove the current top-level commit path for this repo, including:

- the procedure implementation file
- the built-in registration
- any tests whose only purpose is the superseded top-level command

The replacement command is `nanoboss/commit`.

---

## Edge cases

### No Git repo

For this repo-specific v1, it is acceptable to fail clearly if Git metadata is unavailable.

### Flaky tests

Use `--refresh` to force a real rerun.

### Dependency-only changes

If the runtime changes, the runtime fingerprint will invalidate the cache.

If local dependency contents change without affecting Git state or runtime identity, v1 may miss that.
That is acceptable for this narrow workflow.

---

## Tests to add

### Shared helper tests

- same workspace state => same fingerprint
- staged change changes fingerprint
- unstaged change changes fingerprint
- untracked file changes fingerprint
- excluded dirs do not affect fingerprint
- exact same workspace + runtime + command => cache hit
- changed workspace => cache miss
- changed runtime => cache miss
- fresh run overwrites prior cache record instead of appending

### `nanoboss/pre-commit-checks` tests

- cache hit replays stored output
- cache hit returns stored nonzero exit code for a failing prior run
- cache miss runs `bun run scripts/compact-test.ts`
- `--refresh` bypasses cache and overwrites stored record

### `nanoboss/commit` tests

- `nanoboss/commit` calls `nanoboss/pre-commit-checks` before commit creation
- failing `nanoboss/pre-commit-checks` blocks commit
- passing `nanoboss/pre-commit-checks` allows commit flow to continue
- cached passing result still allows commit without rerunning checks
- the old top-level `commit` procedure is removed from this repo’s procedure set

---

## Acceptance criteria

1. `nanoboss/pre-commit-checks` is implemented entirely in the procedure layer.
2. `nanoboss/commit` depends on `nanoboss/pre-commit-checks` rather than duplicating its cache logic.
3. The validation command for v1 is the compact wrapper, not raw `bun test`.
4. Repeating the same validation against unchanged workspace state replays the last fresh result instead of rerunning.
5. Both pass and fail results are replayable.
6. Changing staged, unstaged, or relevant untracked files invalidates the cached result.
7. The cache file stores only one result record and is overwritten on each fresh run.
8. The old top-level `commit` procedure is removed for this repo and superseded by `nanoboss/commit`.

---

## Recommendation summary

For v1, implement the smallest thing that matches the workflow:

- one repo-local `nanoboss/pre-commit-checks` procedure
- one repo-local `nanoboss/commit` procedure that delegates to it
- one procedure-local helper in `procedures/nanoboss/`
- one fixed validation command: `bun run scripts/compact-test.ts`
- one single-entry cache file containing the last fresh result
- removal of the old top-level `commit`

That keeps the feature narrow, keeps it out of nanoboss core, and makes the two scoped procedures behave as one coherent repo-specific commit workflow.
