# 2026-04-03 plan: reduce nanoboss frontend tests to essentials after pi-tui migration

## Goal

Remove tests that are really testing terminal-framework behavior, keep only tests for behavior nanoboss still owns, and make it possible to delete the remaining legacy non-TTY CLI fallback.

---

## Core principle

After the pi-tui migration, nanoboss should **not** keep tests whose true subject is:

- terminal rendering details
- markdown display fidelity
- editor/input behavior
- key handling
- slash-menu rendering
- list/picker rendering
- cursor/prompt behavior
- stdout vs stderr layout details

Those belong to `@mariozechner/pi-tui`, not nanoboss.

Nanoboss should test only:

1. **its CLI surface**
2. **its reducer/controller logic**
3. **its session/orchestration behavior**
4. **its backend/service behavior**

---

## What to keep

### 1. CLI surface parsing tests

Keep tests like:

- `tests/unit/nanoboss.test.ts`
- `tests/unit/cli-options.test.ts`
- `tests/unit/resume-options.test.ts`

Why:

- nanoboss owns command parsing and flag semantics

---

### 2. Session selection / resolution logic tests

Keep tests for:

- current-session pointer preference
- explicit session id handling
- stored-session ordering
- resume default selection behavior

Likely files:

- `tests/unit/stored-sessions.test.ts`
- `tests/unit/current-session.test.ts`
- `tests/unit/resume-options.test.ts`

Why:

- nanoboss owns session discovery semantics
- pi-tui only renders the picker

---

### 3. TUI reducer tests

Keep and expand reducer coverage in:

- `tests/unit/tui-reducer.test.ts`

This should cover:

- `run_started` / `text_delta` / `run_completed`
- `run_failed`
- nested tool lifecycle / wrapper depth
- command list merging
- status/prompt diagnostics/token usage state
- session reset behavior if reducer owns any part of it

Why:

- this is nanoboss-owned frontend state logic

---

### 4. Backend/service tests

Keep the existing backend-heavy tests that already verify:

- slash dispatch
n- memory cards
- token usage
- session continuity
- MCP/session retrieval behavior

In practice this includes files like:

- `tests/unit/service.test.ts`
- `tests/unit/default-history.test.ts`
- `tests/unit/session-mcp*.test.ts`
- related backend/unit tests already in place

Why:

- these tests validate product behavior independently of the frontend

---

## What to delete

### Delete `tests/unit/cli-local-commands.test.ts`

Delete the whole file rather than porting it.

Reason:

it is mostly asserting the old interactive CLI contract over piped stdio, including things nanoboss no longer owns:

- exact prompt text (`> `)
- stdout/stderr transcript layout
- old markdown terminal rendering
- old tool-trace line formatting
- line-based pipe interactivity for `nanoboss cli`

These are not the right tests for a pi-tui frontend.

---

### Delete tests that only covered old readline prompt behavior

This likely includes:

- `tests/unit/cli-multiline-input.test.ts` (already a deletion candidate)

Reason:

- this tested an implementation detail of the old readline frontend
- pi-tui owns interactive input behavior now

---

## What to replace

### Add nanoboss-owned TUI app/controller tests

Add a new test file, likely:

- `tests/unit/tui-app.test.ts`
  or
- `tests/unit/tui-controller.test.ts`

These tests should verify **nanoboss orchestration**, not rendering.

Target behaviors:

1. `/quit` or `/exit` triggers app shutdown intent
2. `/new` creates a new session and reconnects event stream
3. `/model` selection sends the expected `/model <provider> <model>` command
4. inline `/model provider model` updates local selection/banner state
5. sending a prompt:
   - appends a user turn
   - disables submit while active
   - reenables submit on completion/failure
6. session ready/resume updates local state correctly

These tests will probably require a small refactor so the TUI app/controller can accept mocked dependencies for:

- `createHttpSession(...)`
- `resumeHttpSession(...)`
- `sendSessionPrompt(...)`
- `startSessionEventStream(...)`
- model picker callback
- exit callback

That refactor is good: it isolates nanoboss orchestration from the concrete terminal runtime.

---

## Optional smoke test policy

Do **not** keep pipe-based fake-interactive CLI tests.

If a single interactive smoke test is desired later, it should be:

- PTY-based
- minimal
- human-UX smoke only

Example acceptable smoke test:

- start `nanoboss cli` in a PTY
- verify it can start and quit cleanly

But this is optional. If PTY testing is annoying or flaky, skip it.

The important tests are reducer/controller/service tests.

---

## Relationship to deleting legacy non-TTY CLI code

The remaining legacy fallback in:

- `src/http-cli-legacy.ts`

exists mainly because the old pipe-based CLI tests assumed `nanoboss cli` could be driven over plain stdio.

Once the old CLI tests are removed and replaced appropriately, decide whether to:

### Option A: keep non-TTY fallback

Keep `src/http-cli-legacy.ts` only as compatibility support for automation.

### Option B: remove non-TTY fallback entirely

Preferred if we want the cleanest architecture.

Then:

- `nanoboss cli` becomes TTY-only
- non-interactive automation should use:
  - HTTP/SSE server APIs
  - MCP
  - ACP/server mode
  - any future explicit machine interface

If choosing Option B, delete:

- `src/http-cli-legacy.ts`

and fail fast with a clear message when `nanoboss cli` is started without a TTY.

---

## Recommended execution order

1. **Delete old readline/pipe CLI tests**
   - remove `tests/unit/cli-local-commands.test.ts`
   - remove any remaining old prompt-input tests

2. **Add TUI app/controller tests**
   - create a test seam for mocked session/prompt/stream dependencies
   - cover `/quit`, `/new`, `/model`, prompt submission, and active-run lifecycle

3. **Re-run full suite**
   - verify all product behavior is still covered via reducer/controller/service tests

4. **Decide fate of `src/http-cli-legacy.ts`**
   - keep only if explicit compatibility is desired
   - otherwise delete it and make `cli` TTY-only

5. **If deleting legacy fallback**
   - update help/error text to explain that `cli` requires a TTY
   - direct automation toward HTTP/MCP/ACP interfaces

---

## Acceptance criteria

This work is done when:

1. nanoboss no longer keeps tests that are actually testing pi-tui behavior
2. old pipe-driven CLI tests are gone
3. nanoboss-owned frontend behavior is covered by reducer/controller tests instead
4. backend/service behavior remains covered independently of the frontend
5. we can make a clean decision on whether `src/http-cli-legacy.ts` should remain or be deleted

---

## Strong recommendation

Do **not** port `tests/unit/cli-local-commands.test.ts` to the new TUI.

Instead:

- delete it
- replace only the nanoboss-owned parts with controller tests
- let pi-tui own its own rendering/editor/input test surface
