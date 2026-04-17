# Procedure SDK Hermetic Package Plan

## Goal

Make `@nanoboss/procedure-sdk` buildable and testable as an independently sealed package, with its owned contract validated from inside `packages/procedure-sdk` rather than depending on root tests or sibling-package test suites.

Target developer loop:

```bash
cd packages/procedure-sdk
bun run build
bun run typecheck
bun test
```

That loop should be sufficient to prove the package's public contract.

## Current gap

The package currently has good coverage for pure helpers, but some important contract behavior is only proven outside the package:

- typed nested run/result shaping is asserted in [packages/procedure-engine/tests/procedure-engine-package.test.ts](/Users/jflam/agentboss/workspaces/nanoboss/packages/procedure-engine/tests/procedure-engine-package.test.ts:274)
- typed agent schema persistence is asserted in [tests/unit/context-call-agent-session.test.ts](/Users/jflam/agentboss/workspaces/nanoboss/tests/unit/context-call-agent-session.test.ts:224)
- `packages/procedure-sdk/package.json` has `test` and `typecheck`, but no `build` script or built-artifact validation path
- workspace consumers currently resolve the package through source exports and root `tsconfig` path aliases, which means package-local tests do not prove that the package can stand on its own as a built dependency

This creates two problems:

1. the package's real contract is partly validated elsewhere
2. the package is not yet hermetically proven as an independently buildable/testable unit

## Desired end state

`@nanoboss/procedure-sdk` should own and prove:

- its public entrypoint shape
- its helper behavior
- its exported types and docs
- a consumer-style compile/use flow against built package artifacts

It should not need to own and prove:

- procedure-engine runtime orchestration
- store persistence implementation
- agent-acp transport behavior

Those remain sibling-package responsibilities. The key change is that `procedure-sdk` should have a package-local contract harness that proves its public surface in consumer terms, while cross-package runtime interoperability remains covered in the packages that own that behavior.

## Plan

### 1. Add a real package build

Add a package-local build step for `procedure-sdk`.

Concrete work:

- add `tsconfig.build.json` or equivalent package-local build config
- add `build` script in [packages/procedure-sdk/package.json](/Users/jflam/agentboss/workspaces/nanoboss/packages/procedure-sdk/package.json:1)
- emit build artifacts to `dist/`
- switch `exports` to built output for published/package-local consumer tests, while preserving current workspace ergonomics if needed through a separate dev path

Acceptance criteria:

- `cd packages/procedure-sdk && bun run build` succeeds without depending on root test runners
- emitted JS and `.d.ts` cover the full public entrypoint

### 2. Add a hermetic consumer fixture inside the package

Create a package-local fixture that behaves like an external consumer.

Concrete work:

- add `packages/procedure-sdk/test-fixtures/consumer/`
- give the fixture its own `package.json` and `tsconfig.json`
- make the fixture import `@nanoboss/procedure-sdk` only through the package entrypoint, not through repo source paths
- have the fixture typecheck a realistic procedure authoring flow:
  - define a `Procedure`
  - use `jsonType(...)`
  - use prompt-input helpers
  - use `expectData(...)` / `expectDataRef(...)`

Recommended implementation:

- build `procedure-sdk`
- point the fixture at the built package artifacts or a packed tarball
- run fixture typecheck as part of the package test/build workflow

Acceptance criteria:

- the consumer fixture compiles using only the built package surface
- the fixture does not import root `src/`, sibling packages, or repo-only aliases

### 3. Move package-owned contract checks fully into package-local tests

Anything that is about `procedure-sdk`'s own contract should live under `packages/procedure-sdk/tests/`.

Concrete work:

- keep the current pure-helper tests
- add entrypoint coverage that checks the built package surface, not just source exports
- add consumer-style tests that demonstrate intended use patterns
- add regression tests for package-owned invariants:
  - prompt-input parse/normalize rules
  - result helper semantics
  - cancellation normalization
  - exported symbol stability

Important boundary:

- do not pull `procedure-engine`, `store`, or `agent-acp` into `procedure-sdk` just to recreate runtime tests locally
- if a behavior requires those packages to exist, it is not purely `procedure-sdk`-owned and should stay covered where that behavior is implemented

Acceptance criteria:

- removing root-level `procedure-sdk` contract assertions does not reduce package-owned coverage
- package tests read as executable documentation for authors

### 4. Re-home cross-package runtime assertions to the owning packages

Some current "procedure-sdk contract" assertions are really runtime interoperability checks.

Concrete work:

- keep typed child-run schema persistence tests in `procedure-engine`, because engine owns child-run result shaping
- keep stored result field persistence tests in `store`, because store owns the durable run record
- keep transport/input capability tests in `agent-acp` or `app-runtime`, because they own those failure modes
- rewrite test names and comments so they describe interoperability with the sdk, not sdk ownership

This is important for hermeticity: the sdk package should not pretend to own behavior implemented elsewhere.

Acceptance criteria:

- each package proves the behavior it implements
- `procedure-sdk` proves only its author-facing public surface and consumer contract

### 5. Add a package-local hermetic check script

Add one package command that runs the full sealed verification flow.

Concrete work:

- add `test:hermetic` script in `packages/procedure-sdk/package.json`
- recommended sequence:
  1. clean `dist`
  2. build package
  3. run package-local tests
  4. run consumer-fixture typecheck
  5. optionally run a pack/install smoke check

Possible forms:

```bash
bun run build
bun test
bun run test:consumer
```

or one wrapped script that does the same.

Acceptance criteria:

- one package-local command proves the package can be built and consumed independently

### 6. Tighten CI expectations

Once the package is hermetic, wire CI and package fan-out around that reality.

Concrete work:

- include `build` in package fan-out checks for `procedure-sdk`
- ensure the package-local hermetic script runs in CI
- make failure messages point maintainers to `cd packages/procedure-sdk`

Acceptance criteria:

- regressions in package buildability or consumer usability fail at the package boundary, not later in root integration tests

## Recommended sequencing

1. add `build`
2. add the consumer fixture
3. add package-local hermetic scripts
4. move/relabel runtime interoperability tests in sibling packages
5. update CI/package fan-out

## Risks

- changing `exports` from source to built output may disturb current workspace development flow if done abruptly
- a packed-consumer fixture adds maintenance cost if its setup drifts from the actual package shape
- trying to force engine/store behavior into `procedure-sdk` tests would blur boundaries and make the package less sealed, not more

## Decision rules

Use these rules while implementing:

- if the assertion can be proven with only `@nanoboss/procedure-sdk` and `@nanoboss/contracts`, it belongs in `packages/procedure-sdk`
- if the assertion depends on runtime execution, storage, or transport behavior, it belongs in the package that owns that behavior
- the hermetic package check must consume built artifacts, not repo source aliases

## Exit criteria

This plan is complete when all of the following are true:

- `packages/procedure-sdk` has a `build` script
- `packages/procedure-sdk` has a package-local hermetic verification command
- a consumer fixture compiles against the built package surface
- package-owned sdk contract tests live under `packages/procedure-sdk/tests/`
- runtime interoperability checks live in the owning sibling packages
- maintainers can validate the package from inside `packages/procedure-sdk` without relying on root test scopes
