# Model-based `/simplify` loop with architectural memory

## Why this plan exists

The current `/simplify` procedure is already useful, but it is optimized for local simplification opportunities:

- remove duplicate code
- delete dead helpers
- flatten small abstractions
- trim obsolete compatibility shims

That is the right first generation. It is not enough for sustained simplification of a growing codebase.

The deeper problem is that strong coding agents often optimize for local regression avoidance rather than global conceptual reduction. In practice that means they:

- preserve distinctions they do not understand
- add wrappers instead of deleting layers
- generalize behavior instead of challenging the ontology
- spend maintainability to buy short-term implementation safety

This produces the pattern we want `/simplify` to resist:

- code grows
- concept count grows
- boundaries proliferate
- exception paths leak
- the codebase becomes more "AI-sloppy" over time even when each individual change seems careful

The next version of `/simplify` should therefore stop behaving like a duplicate-code hunter and start behaving like a model-based simplifier.

The core idea is:

`/simplify` should maintain a durable working model of the codebase's conceptual shape, use that model to find accidental complexity, involve the human when semantic judgment is required, and log its reasoning so the loop can compound rather than restarting from zero each time.

---

## Problem statement

Today `/simplify` finds one opportunity at a time, asks the user what to do, applies a change, and repeats. That loop is simple and valuable, but it has three major limitations:

1. **No durable architectural memory**
   The procedure does not build or retain a structured model of the repo's concepts, invariants, boundaries, and exceptions.

2. **No dedicated thinking workspace**
   There is no first-class place for the agent to accumulate and revise working hypotheses while reading the codebase.

3. **No simplification journal**
   There is no append-only log of what the loop believed, tried, learned, rejected, or proved over time.

That means each iteration is largely stateless from a design perspective. As the low-hanging fruit disappears, the loop will plateau because deeper simplification requires:

- long-lived conceptual context
- explicit comparison of alternate models
- a record of prior decisions and rejected paths
- human collaboration at the points where architectural taste matters

If a strong human were doing this manually, they would need at least three things:

- a stable architecture notebook
- a messy scratchpad for active thinking
- a journal of what changes were tried and why

The autonomous loop needs the same structure.

---

## Proposed end state

`/simplify` becomes a multi-iteration design loop with three durable knowledge layers:

1. **Architectural memory**
   A structured, revisable model of the codebase's concepts, operations, invariants, boundaries, exceptions, and known smells.

2. **Working notebook**
   A temporary but durable scratch space for active investigation of a specific simplification thread.

3. **Simplification journal**
   An append-only log of scans, hypotheses, human decisions, applied changes, validation outcomes, and follow-up opportunities.

The loop should be able to:

- scan a repo and form architectural hypotheses
- review that memory while thinking about a problem
- distinguish stable architectural beliefs from tentative local notes
- ask the human questions at semantic merge points
- apply one coherent simplification slice
- log what changed in both the code and the model
- continue across sessions without losing the thread

The desired progression is:

- Gen 1: local cleanup
- Gen 2: conceptual normalization
- Gen 3: architectural simplification

This plan is about building the substrate for Gen 2 and Gen 3.

---

## Guiding principles

1. **Model before patch**
   The loop should prefer understanding the codebase's conceptual structure before proposing changes.

2. **Delete before abstract**
   If two paths are accidentally distinct, collapse them; do not wrap them in a new abstraction layer.

3. **One concept, one representation**
   Conceptual duplication is usually more expensive than textual duplication.

4. **Invariants are more fundamental than nouns and verbs**
   Concepts and operations should be justified by the invariants they uphold.

5. **Stable memory and messy thinking are different artifacts**
   Canonical architecture notes should not be polluted by half-formed hypotheses.

6. **Human time should be spent on semantic judgment, not bookkeeping**
   The human should intervene where design taste matters: concept merges, canonical representation choices, real vs accidental boundaries, and exception legitimacy.

7. **The journal matters**
   Simplification should leave behind a trail of reasoning, not just a cleaned-up tree.

8. **Tests are executable architecture**
   The test suite should primarily encode invariants, real boundary contracts, and known exceptional conditions rather than incidental implementation shape.

9. **Backpressure must act during coding, not only after coding**
   The system should make it harder for accidental complexity to enter the codebase in the first place.

---

## Conceptual model for simplification

The loop should explicitly model five object types:

- **concepts**: what exists in the system
- **operations**: what changes or acts on those concepts
- **invariants**: what must remain true
- **boundaries**: where authority, representation, lifecycle, or transport changes
- **exceptions**: where general rules stop holding

This yields a better simplification target than raw noun/verb counting:

`accidental complexity = accidental concepts + accidental boundaries + exception leakage + duplicate representations + scattered invariant enforcement`

This is the key design shift:

The simplifier should not ask only "what looks similar?"

It should ask:

- which distinctions are real?
- which boundaries are justified?
- which invariants are duplicated or implicit?
- which exceptions are domain-required versus implementation artifacts?

Tests sit directly inside this model:

- tests should validate invariants
- tests should guard real boundaries
- tests should pin known exceptions that must continue to exist
- tests should avoid preserving accidental concepts, fake boundaries, or obsolete surface area

---

## Required durable artifacts

The design should include three explicit durable artifacts with different purposes.

### 1. Architectural memory

This is the canonical, relatively stable model of the repo.

It should store items such as:

- canonical concepts and aliases
- operations attached to those concepts
- important invariants
- architectural boundaries
- known exception cases
- smells or simplification candidates
- evidence links pointing back to files, tests, docs, or commits
- confidence and freshness metadata

This memory should answer questions like:

- what are the main concepts in this repo?
- which concepts appear duplicated or ambiguous?
- where are the major authority boundaries?
- what invariants seem central to correctness?
- what exceptions are already known?
- what simplification hypotheses are currently open?

Recommended shape:

- one machine-readable document or ref per repo
- stable identifiers for concepts and boundaries
- small textual summaries with evidence pointers
- explicit separation between `canonical`, `suspect`, and `deprecated` concepts

Suggested schema direction:

- `concepts[]`
- `operations[]`
- `invariants[]`
- `boundaries[]`
- `exceptions[]`
- `hypotheses[]`
- `evidence[]`
- `metrics`

Each architectural object should have fields like:

- `id`
- `kind`
- `name`
- `summary`
- `status`
- `evidenceRefs`
- `relatedIds`
- `confidence`
- `lastReviewedAt`

This is the memory the loop should consult before proposing deeper simplifications.

### 2. Working notebook

This is a durable scratchpad for active reasoning within a simplification thread.

It is intentionally messier than architectural memory. It should hold:

- partial hypotheses
- conflicting interpretations
- "maybe these are the same concept" notes
- areas to inspect next
- snippets of architectural reasoning
- temporary rankings of candidate changes
- open questions for the human

This notebook should be cheap to update and cheap to discard or compress. It is not the source of truth. It is where the agent thinks.

Recommended properties:

- scoped to a specific `/simplify` run or branch of inquiry
- append-friendly
- easy to summarize into architectural memory
- easy for the human to inspect during a discussion

This directly addresses the manual workflow need for "space to write down notes while thinking."

### 3. Simplification journal

This is the append-only record of work performed over time.

It should log:

- scans performed
- major observations
- hypotheses proposed
- human feedback
- decisions taken
- changes applied
- validation outcomes
- updates to architectural memory
- follow-up opportunities

This journal should make it possible to answer:

- what has `/simplify` already tried?
- what ideas were rejected and why?
- what changed in the architectural model after a refactor?
- what kinds of simplification keep recurring?

The journal should be optimized for history and auditability, not compact canonical truth.

---

## Why three artifacts instead of one

Collapsing architecture memory, scratch notes, and the work log into one store would make the loop less useful.

If everything is canonical:

- the memory fills with noisy half-truths
- old dead hypotheses pollute design discussions
- it becomes hard to tell what the loop actually believes

If everything is scratch:

- no stable model compounds across iterations
- the loop restarts from zero every time

If everything is only a log:

- the agent must reconstruct the current architecture from historical prose
- review becomes expensive and error-prone

The clean split is:

- **architectural memory** = current best stable model
- **working notebook** = active temporary reasoning
- **journal** = durable history of the work

---

## User experience goals

The upgraded `/simplify` should support the following human interactions naturally:

1. Start a simplification investigation
   The procedure scans the repo, loads architectural memory, and opens a notebook.

2. Inspect what the loop currently believes
   The user can ask to review concepts, invariants, boundaries, exceptions, or open hypotheses.

3. Redirect the investigation
   The user can say things like:
   - focus on boundary cleanup
   - stop merging concepts for now
   - avoid the session layer
   - show me the current architecture memory

4. Approve or reject semantic moves
   The loop pauses for human judgment when it wants to:
   - merge concepts
   - eliminate a boundary
   - canonically rename a concept
   - demote an exception to an implementation artifact

5. Apply one coherent simplification slice
   The loop edits the repo, validates it, updates memory, and writes the journal.

6. Resume later without losing the thread
   The user can come back and continue from the current notebook, memory, and journal state.

---

## Proposed loop design

The next-generation simplification loop should have distinct phases.

### Phase 1: Load and orient

Inputs:

- current prompt or focus
- existing architectural memory
- current or prior notebook for this thread
- simplification journal
- recent commits and current working tree

Actions:

- load the stable model
- surface relevant prior hypotheses
- identify freshness gaps
- create or resume a notebook entry for this investigation

### Phase 2: Structural scan

The agent scans the repo to identify:

- core modules and boundaries
- type and schema vocabularies
- key entrypoints
- central tests and invariants
- repeated representations
- branch-heavy exception zones
- stale compatibility surfaces
- architectural drift since the last review

This phase should produce observations, not immediate patches.

### Phase 3: Hypothesis formation

The loop proposes candidate simplifications such as:

- merge concept A and B
- remove boundary C
- collapse representations D and E
- centralize invariant F
- inline abstraction G
- quarantine exception H

Each hypothesis should include:

- expected conceptual delta
- evidence
- probable risks
- required human judgment
- estimated implementation slice

### Phase 4: Human checkpoint

The loop should pause when it reaches semantic choices, not only when it has a patch ready.

Examples:

- "These two modules appear to encode one concept. Should they be merged conceptually?"
- "This boundary looks historical rather than essential. Do you want to challenge it?"
- "There are two representations of session identity. Which one should become canonical?"

This is the stage where human taste and repository ownership matter most.

### Phase 5: Apply one simplification slice

The agent executes one coherent change set with a strong bias toward:

- deletion
- inlining
- collapsing parallel paths
- choosing one canonical representation
- centralizing invariant enforcement

It should be explicitly biased against:

- generic wrappers
- compatibility layers without real callers
- option proliferation
- abstractions created only to avoid touching existing code

During this phase, the loop should also update the test suite in the same conceptual direction:

- remove tests that only preserve deleted surface complexity
- add or strengthen tests for the surviving invariants and boundaries
- deduplicate semantically equivalent cases to keep validation fast

### Phase 6: Validate and update state

After implementation:

- run the relevant validation
- compare the before/after architectural model
- update architectural memory
- append a journal entry
- either close or continue the notebook thread

Validation should be tiered so the loop can move quickly without normalizing on weak checking:

- minimal focused tests during active coding
- broader subsystem tests before completing a simplification slice
- full suite in CI or explicit repo-wide validation steps

---

## Test suite as a core simplification surface

The test suite is not separate from simplification. It is one of the main places where complexity either gets removed or fossilized.

A simplification-oriented test strategy should do two things at once:

- increase confidence to enable deeper refactors
- reduce incidental test complexity so validation stays fast

The key rule is:

Tests should maximize protection of invariants and minimize attachment to accidental structure.

### What to remove

The loop should actively look for tests that create drag without protecting important semantics.

Examples:

- obviously dead tests for removed behavior
- tests that only exercise duplicate public surfaces where one canonical surface should remain
- tests that pin helper decomposition, call ordering, or module topology without those being true contracts
- semantically duplicated tests that cover the same invariant through near-identical setups
- regression tests for exceptional paths that are no longer legitimate after simplification

### What to strengthen

The loop should preferentially add or harden:

- invariant tests
- state-transition tests for workflow-heavy subsystems
- boundary contract tests
- regression tests for true exceptional conditions
- tests for impossible states or forbidden transitions

### Test taxonomy

The plan should classify tests by purpose so the loop can reason about whether they are valuable.

Recommended categories:

- `invariant`
- `boundary_contract`
- `state_machine`
- `exception_regression`
- `smoke`
- `integration`
- `incidental_surface`

This does not require immediate renaming of every test. It does require the simplification loop to reason in these terms.

Each class should have a default interpretation:

- `invariant`
  Guards a truth that should remain stable across refactors.

- `boundary_contract`
  Guards behavior at a real API, transport, storage, or authority boundary.

- `state_machine`
  Guards allowed and forbidden transitions in a workflow-heavy subsystem.

- `exception_regression`
  Guards a true exceptional condition that must continue to be handled.

- `smoke`
  Verifies that a core path still works at all with very low runtime cost.

- `integration`
  Verifies composition across multiple subsystems where unit-level tests are insufficient.

- `incidental_surface`
  Primarily pins current structure rather than durable semantics and is therefore a simplification target unless justified.

The loop should also attach a rough priority and runtime expectation to each class:

- `invariant`, `boundary_contract`, and `smoke` tests should preferentially live in the fast lane
- `state_machine` tests should stay compact and intentional
- `integration` tests should be curated rather than allowed to grow without bound
- `incidental_surface` tests should be treated as suspect until proven necessary

### Test metadata and classification strategy

The system needs a practical way to classify tests without requiring a giant manual taxonomy project up front.

Recommended v1 approach:

- infer an initial class from file location, naming, and assertions
- allow explicit overrides in lightweight metadata
- let `/simplify` and future tooling refine the classification over time

Possible metadata carriers:

- inline comments or tags
- a sidecar manifest
- a generated classification cache in nanoboss state

The key requirement is not the exact storage format. The key requirement is that the system can answer:

- what semantic purpose does this test serve?
- is this test in the fast lane?
- what concepts, boundaries, or exceptions does it protect?

### Classification as an evolving model

Test classification should not be treated as permanently correct. Like architecture memory, it is a revisable working model.

The loop should be able to:

- upgrade a test from `integration` to `boundary_contract` if the system's conceptual model becomes clearer
- downgrade a test to `incidental_surface` if it turns out to protect only obsolete structure
- merge several tests into one more clearly classified semantic test
- split one broad test into smaller tests with clearer purposes

### Test duplication and runtime control

Test deduplication is important not just for neatness but for speed. A slow suite weakens architectural discipline because agents will avoid running it or will rely on partial confidence by default.

The loop should identify:

- duplicate fixtures
- duplicate scenario setup
- many tests expressing one invariant
- broad integration tests that can be replaced by one boundary test plus one invariant test

The goal is not fewer tests at any cost. The goal is fewer semantically redundant tests and more concentrated semantic coverage.

The loop should therefore reason about semantic duplication, not only textual duplication.

Examples of semantic duplication:

- several tests proving the same invariant through slightly different fixtures
- a broad integration test and a narrower boundary-contract test guarding the same behavior
- repeated regression tests around multiple wrappers for one underlying exceptional condition

Where semantic duplication exists, the simplifier should prefer:

- one sharp invariant test over many narrative variants
- one canonical boundary test over many near-identical public-surface tests
- parameterization when many examples encode one rule

### Test suite quality signals

The simplification loop should treat the following as smells:

- large numbers of tests around thin wrappers
- tests that fail after harmless internal refactors
- fixture sprawl encoding many subtly different representations
- flaky tests caused by unclear boundaries or hidden state
- inability to identify the smallest trusted test slice for a change

---

## Backpressure as a first-class design goal

Simplification cannot succeed if it only runs as a cleanup pass after uncontrolled growth. The system needs backpressure mechanisms that operate during normal coding.

Backpressure means the codebase should push back when a change introduces accidental complexity without enough justification.

There are two primary surfaces where backpressure matters:

- production code
- tests

### Code backpressure during coding

The loop should not only search for simplifications after the fact. It should also pressure ordinary implementation work toward simpler outcomes.

Practical forms of backpressure:

- require a short conceptual justification when a change introduces a new concept, abstraction layer, option, or boundary
- prefer touching and simplifying existing code over wrapping it
- after a coding task, scan the touched area for concept growth, new special cases, and new duplicate representations
- surface a "simplification follow-up" immediately when a change could have been simpler
- make "no new accidental concepts" part of the local definition of done

In effect, implementation work should end with a micro-simplify pass over the touched area, not wait for a later repo-wide cleanup.

That micro-simplify pass should include a local test question:

- what is the smallest trusted semantic test slice for this change?

### Test backpressure during coding

Tests also need pressure against unbounded growth.

Practical forms of backpressure:

- every new test should justify what invariant, boundary, or exception it protects
- avoid adding multiple tests for the same semantic point unless they cover truly distinct cases
- prefer table-driven or parameterized tests when many examples encode one rule
- delete obsolete tests in the same change that removes obsolete code
- treat test runtime budget as a real engineering constraint
- question whether a new test belongs in the fast lane or the broader validation lane

### Continuous versus deferred simplification

The intended balance is:

- **during coding**: apply local backpressure in the touched area
- **during `/simplify` runs**: perform deliberate deeper normalization and architectural cleanup

Those are complementary, not competing, modes.

Without continuous backpressure:

- local agent behavior will continue to add wrappers and exceptions
- `/simplify` becomes a janitor for avoidable mess

With continuous backpressure:

- `/simplify` can spend more time on real architectural reduction rather than trash pickup

---

## Tiered validation strategy

To preserve both velocity and confidence, validation should be intentionally tiered.

### Tier 1: minimal trusted local slice

This is the smallest fast test set that gives confidence for the active change.

It should usually include:

- tests directly covering the touched invariants
- tests covering affected boundaries
- a small smoke check for the changed subsystem

This is the default validation path during active coding.

### Tier 2: subsystem confidence slice

This is a broader but still targeted set run before completing a simplification slice or significant implementation task.

It should include:

- the local slice
- neighboring subsystem tests
- key regressions for recently touched exception paths

### Tier 3: repo-wide validation

This is the full suite or other heavyweight validation.

Recommended use:

- CI
- explicit pre-merge checks
- large simplification steps
- changes that alter central architecture or shared primitives

The loop should not normalize on running the full suite after every tiny edit if that meaningfully harms velocity. It should also not use speed as an excuse to skip a well-defined trusted local slice.

### Choosing tests intentionally

The system should get better at selecting the smallest meaningful validation set.

That likely means:

- mapping tests to concepts, boundaries, or subsystems
- keeping a curated fast lane for the highest-value semantic checks
- recording which test slices have historically caught regressions for certain areas

---

## Code-to-test mapping model

To make tiered validation real, the system needs a model that connects implementation areas to the tests that protect their semantics.

This mapping should not be thought of as mere file coverage. It is a semantic dependency graph.

The relevant question is not only:

- which tests touch these lines?

It is:

- which tests protect the concepts, invariants, boundaries, and exceptions affected by this change?

### Mapping dimensions

The mapping should be able to connect code and tests across several dimensions:

- file or module ownership
- subsystem membership
- concept coverage
- invariant coverage
- boundary coverage
- exception coverage
- runtime tier
- historical defect catch rate

The most important dimensions for simplification are:

- `conceptIds`
- `invariantIds`
- `boundaryIds`
- `exceptionIds`
- `subsystem`
- `tier`

### Recommended v1 mapping strategy

The first version does not need a perfect graph. It needs a useful approximation that can improve over time.

Recommended starting approach:

1. Map production files to subsystems.
2. Map tests to one or more subsystems.
3. Let the agent infer likely concept, invariant, and boundary coverage from names, assertions, and nearby files.
4. Store these mappings as revisable metadata rather than pretending they are ground truth.
5. Use the mapping to propose a minimal trusted slice for each change.

This is enough to start making validation selection explicit instead of improvised.

### Minimal trusted slice selection

Given a change, the loop should select tests in this order:

1. tests mapped to the changed invariants
2. tests mapped to affected boundaries
3. tests mapped to changed exceptions
4. smoke tests for the touched subsystem
5. a broader subsystem slice if the change touches shared primitives or central orchestration

This selection should produce an explanation, not just a list.

For example:

- "Run these 5 tests because the change touches the paused-procedure invariant and the session continuation boundary."

That explanation is important because it makes test choice reviewable and correctable.

### Mapping confidence and refinement

The mapping will often be imperfect at first. That is acceptable if the system records confidence and learns.

Each mapping should have rough status such as:

- `explicit`
- `inferred_high_confidence`
- `inferred_low_confidence`
- `stale`

The loop should refine mappings when:

- a test repeatedly catches regressions in an area
- a chosen test slice proves insufficient
- a test turns out to be irrelevant to a change it was thought to protect
- architecture memory is updated and concept identities shift

### Mapping as a simplification tool

Code-to-test mapping is not only for validation selection. It also helps identify architectural smells.

Examples:

- a core invariant with no strong tests
- many tests mapped to a suspect accidental concept
- one concept requiring too many unrelated tests to validate
- a test slice that is huge because the subsystem boundary is muddy

These are useful simplification signals in their own right.

---

## Design memory as a revisable specification

The user correctly called out that we should not bias toward "the architecture is always right."

Architectural memory should not be treated as doctrine. It should be treated as a revisable specification: the current best model of the system, held strongly enough to guide implementation but weakly enough to change when requirements or evidence demand it.

This is close to a compiler model:

- the design is a structured intermediate representation of intent
- the human and the agent both "compile" changes against that representation
- tests validate whether the implementation still satisfies the intended semantics
- when requirements change, the design IR must sometimes be revised before code changes can be judged correctly

The key principle is:

Design should constrain implementation, but reality should be allowed to update design.

### Design evolution triggers

The loop should explicitly recognize events that justify revising architectural memory:

- a new product requirement introduces a truly new concept
- a previously accidental exception becomes essential because the domain changed
- a boundary becomes real because authority, lifecycle, or deployment constraints changed
- repeated implementation pressure shows that the current model is missing an important distinction
- tests reveal that an assumed invariant was too strong, too weak, or wrongly located

### Change protocol for architectural memory

When the loop believes the design model should change, it should not quietly mutate the architecture artifact in passing. It should record a structured design update.

Recommended flow:

1. identify the tension between current architecture memory and observed requirements or code reality
2. propose a design update in notebook form
3. ask the human for judgment if the update is semantically significant
4. revise architectural memory
5. record the update in the journal
6. adjust test mappings and test expectations accordingly

This keeps design evolution rational rather than accidental.

### Architectural drift versus legitimate evolution

The loop should distinguish between:

- **drift**
  Code has moved away from the intended design without justification.

- **evolution**
  The intended design itself needs to change because new requirements or clearer understanding emerged.

This distinction matters because the correct action differs:

- drift should usually trigger simplification back toward the design
- evolution should usually trigger a design update, then code and test changes aligned to the new design

### Tests as validators of the design IR

In this compiler-like model, tests are not just regression detectors. They are executable checks on the current design representation.

That means:

- if design changes, some tests should change because the semantics changed
- if code changes but design does not, tests should mostly continue to hold
- if many tests break after a harmless refactor, those tests may be attached to accidental structure rather than design semantics

This gives a rational way to update the design rather than treating architecture docs as sacred or disposable.

Longer term, `/simplify` and ordinary coding flows should be able to ask:

- what is the minimal test set that protects the semantics of this change?
- what broader suite is required because this change touched shared architecture?

---

## Definition-of-done implications

If backpressure is real, then "done" for a change cannot mean only "the code works."

A stronger definition of done is:

- the change does not introduce unjustified new concepts, boundaries, or exceptions
- the touched area has undergone a local simplification scan
- obsolete tests and dead fixtures were removed
- new tests, if added, protect invariants or real contracts
- the minimal trusted validation slice was run

This is the operational link between day-to-day coding and the deeper `/simplify` loop.

---

## Review surfaces needed during the loop

The user explicitly asked for ways to review memory while thinking about a problem. That should be a first-class part of the design.

The loop needs review surfaces for all three artifacts.

### Architectural memory review

The user should be able to ask for compact views like:

- current concepts
- current invariants
- current boundaries
- known exceptions
- open hypotheses
- concepts with low confidence
- recent changes to architectural memory

The point is not to dump raw JSON. The point is to make the model inspectable while discussing design.

### Working notebook review

The user should be able to inspect:

- current line of investigation
- top candidate simplifications
- open questions
- unresolved ambiguities
- "why the loop thinks these concepts are related"

This is the live thinking surface.

### Journal review

The user should be able to review:

- recent simplification runs
- decisions taken
- rejected hypotheses
- successful refactors
- recurring architectural smells

This helps avoid repeating failed investigations.

---

## Storage strategy options

This plan does not force a final storage implementation yet, but it should narrow the design.

### Option A: repo-local files under a `.nanoboss/` or similar directory

Pros:

- easy to inspect in git
- easy to diff and review
- easy to preserve across sessions and branches

Cons:

- can create repo noise
- may require branch management choices
- not all users will want these artifacts committed

### Option B: durable session refs / nanoboss store only

Pros:

- already fits the runtime model
- avoids polluting the repo tree
- can be naturally attached to sessions and procedures

Cons:

- less visible during ordinary repo review
- harder to share as codebase-level artifacts
- weaker branch-level semantics

### Option C: hybrid approach

Recommended direction:

- keep the working notebook and fine-grained journal in durable session/store state
- periodically materialize architectural memory snapshots as repo-visible artifacts or explicit exports

This keeps active reasoning lightweight while still allowing the codebase's architectural model to become inspectable and portable.

An alternate hybrid is also plausible:

- repo-visible canonical architectural memory
- session-local notebook
- append-only journal in durable store with export capability

The important point is not the exact backend yet. It is keeping the three artifact roles distinct.

---

## Recommended first implementation shape

The most pragmatic path is to add the new loop incrementally rather than trying to solve all architecture-memory problems in one pass.

### Step 1: Add explicit artifact types inside `/simplify`

Add internal support for:

- architectural memory state
- per-thread notebook state
- simplification journal entries

Even if the first version stores them in plain JSON blobs, the procedure API should treat them as separate artifacts.

### Step 2: Add read/review commands or sub-modes

The user needs ways to inspect these artifacts while discussing a problem. That could be done through:

- richer `/simplify` conversational replies
- explicit inspect verbs
- dedicated helper procedures later if needed

The short-term requirement is simple:

The user must be able to ask what the loop currently believes and why.

### Step 3: Change opportunity generation from local scan to model update + proposal

Before proposing a patch, `/simplify` should:

- refresh relevant architectural memory
- update the notebook with current observations
- generate hypotheses against that memory

This is the point where the procedure stops being stateless.

### Step 4: Add semantic checkpoint prompts

Teach the procedure to stop and ask for user input when:

- concepts may be merged
- a canonical representation must be chosen
- a boundary is being challenged
- an exception may be eliminated

### Step 5: Add post-change model reconciliation

After each applied simplification:

- update the architectural memory
- write a journal record
- summarize what changed in conceptual terms, not only file terms

---

## Proposed data model

The exact schema will need iteration, but the plan should anchor a starting point.

### Architectural memory

```json
{
  "repoId": "nanoboss",
  "version": 1,
  "updatedAt": "2026-04-08T00:00:00Z",
  "concepts": [],
  "operations": [],
  "invariants": [],
  "boundaries": [],
  "exceptions": [],
  "hypotheses": [],
  "metrics": {
    "conceptCount": 0,
    "boundaryCount": 0,
    "exceptionCount": 0,
    "duplicateRepresentationCount": 0
  }
}
```

### Working notebook

```json
{
  "threadId": "simplify-2026-04-08-001",
  "focus": "simplify architecture around paused procedures",
  "status": "active",
  "observations": [],
  "candidateHypotheses": [],
  "openQuestions": [],
  "nextReads": [],
  "lastUpdatedAt": "2026-04-08T00:00:00Z"
}
```

### Journal entry

```json
{
  "entryId": "journal-2026-04-08-001",
  "threadId": "simplify-2026-04-08-001",
  "kind": "hypothesis_applied",
  "summary": "Collapsed duplicate session inspection procedures into MCP-only surface",
  "observations": [],
  "decision": {},
  "validation": {},
  "memoryUpdates": [],
  "createdAt": "2026-04-08T00:00:00Z"
}
```

These should be treated as starting scaffolds, not final formats.

---

## Scoring simplification hypotheses

The upgraded loop should rank opportunities by conceptual value, not just textual duplication.

A candidate simplification should be scored on:

- reduction in concept count
- reduction in duplicate representations
- reduction in boundary count
- reduction in exception leakage
- centralization of invariant enforcement
- confidence in the diagnosis
- size and risk of the change
- clarity of validation path

The loop should prefer:

- small-to-medium changes with high conceptual delta
- changes that make future simplification easier
- changes that remove historical structure

The loop should avoid:

- broad rewrites with weak conceptual evidence
- changes that only rename complexity
- "unifying" abstractions that preserve accidental distinctions under one interface

---

## Human checkpoints

The human should be involved at design-critical moments.

Required checkpoint classes:

1. **Concept merge**
   The loop believes two named things are one concept.

2. **Canonical representation choice**
   The loop needs to choose which of several shapes or APIs should survive.

3. **Boundary challenge**
   The loop wants to eliminate or bypass a boundary.

4. **Exception legitimacy**
   The loop suspects a special case is implementation-created rather than domain-required.

5. **Taste conflict**
   Several technically valid simplifications exist and the best choice depends on repository style or future direction.

These checkpoints are where the procedure should become conversational and explicit about tradeoffs.

---

## Observability and logs

The user explicitly asked whether this system needs "a log of the work being done." The answer is yes.

The journal should support at least:

- chronological entries
- filtering by thread, area, or concept
- links to touched files and commits
- links to architectural memory updates
- human decisions recorded in plain language
- machine-generated summaries of before/after conceptual shape

This is not optional polish. It is necessary for:

- trust
- continuity
- reviewability
- avoiding repeated dead ends
- making the loop's design taste inspectable

---

## Success criteria

The upgraded `/simplify` is successful if it can do more than local cleanup.

Concrete signs of success:

1. It can explain the repo's current core concepts, invariants, boundaries, and exceptions in a stable way.
2. It can show its current notebook while reasoning about a simplification problem.
3. It keeps a durable journal of what it tried and why.
4. It asks the human design questions before semantic merges, not only after a patch exists.
5. Its applied changes increasingly remove concepts and boundaries rather than introduce new wrappers.
6. The codebase becomes easier to extend without repeated AI-generated over-abstraction.

---

## Non-goals for the first iteration

To keep the implementation tractable, the first version should not try to:

- solve full program analysis
- infer perfect architecture automatically
- replace human design judgment
- build a giant universal ontology for all repos
- optimize for zero false positives

The first useful version only needs to:

- maintain durable conceptual artifacts
- make them reviewable
- use them to improve opportunity selection
- learn from each simplification cycle

---

## Implementation workstreams

### Workstream 1: Define artifact boundaries and schemas

Goal:

- create initial schemas for architectural memory, notebook threads, and journal entries

Deliverables:

- TypeScript types
- serialization strategy
- versioning story
- compact summary renderers for each artifact type

### Workstream 2: Decide storage backend

Goal:

- choose initial persistence locations for the three artifact classes

Questions:

- repo-visible, session-store, or hybrid?
- branch-scoped or repo-scoped memory?
- how should snapshots or exports work?

### Workstream 3: Add review surfaces

Goal:

- let the user inspect the current model while talking to `/simplify`

Deliverables:

- compact displays for concepts, invariants, boundaries, exceptions, notebook state, and recent journal entries

### Workstream 4: Upgrade opportunity selection

Goal:

- base opportunity generation on architectural memory and notebook state rather than fresh local scans alone

Deliverables:

- memory refresh pass
- hypothesis generation pass
- conceptual scoring pass

### Workstream 5: Add semantic checkpoints

Goal:

- pause for human guidance at the right design moments

Deliverables:

- checkpoint taxonomy
- prompt templates
- durable recording of human decisions

### Workstream 6: Add post-change reconciliation

Goal:

- update the model after every applied simplification

Deliverables:

- memory diff
- journal append
- concise conceptual change summary

### Workstream 7: Test classification and code-to-test mapping

Goal:

- make test selection semantic, reviewable, and fast enough to support continuous backpressure

Deliverables:

- initial test taxonomy support
- metadata or inferred mapping from tests to concepts, invariants, boundaries, exceptions, and subsystems
- minimal trusted slice selection logic
- feedback loop for refining stale or low-confidence mappings

### Workstream 8: Design-evolution protocol

Goal:

- let the architecture model change rationally when requirements change rather than freezing accidental assumptions

Deliverables:

- design-update flow
- distinction between drift and legitimate evolution
- journal support for architectural revisions
- test-mapping and validation updates tied to design changes

---

## Open questions

1. Should architectural memory be branch-specific, repo-global, or layered?
2. Should the canonical architecture artifact live in git or only in nanoboss state?
3. How aggressively should the loop infer invariants from tests versus explicit docs?
4. How much freeform prose should notebook entries allow before they become hard to summarize?
5. Should `/simplify` own these artifacts exclusively, or should they become general nanoboss knowledge primitives?
6. What is the minimum useful set of review commands or conversational prompts?
7. How should concept identity survive file moves or subsystem renames?
8. What metadata format is least annoying while still making test classification and mapping useful?
9. How much of the code-to-test mapping should be inferred versus explicitly curated?
10. When a design update is approved, what should be updated first: architecture memory, tests, or implementation?

---

## Recommended next step

Before implementing broad behavior changes, the next concrete design pass should answer two narrow questions:

1. **Artifact design**
   What exact shapes do we want for architectural memory, notebook threads, and journal entries in v1?

2. **Storage design**
   Which of those artifacts should live in session state versus repo-visible files in the first implementation?

Immediately after that, the most leverage-heavy follow-up design should answer:

3. **Test classification and mapping**
   What minimal metadata and inference model do we need to choose a trusted fast validation slice for a given change?

4. **Design evolution protocol**
   How does the system decide whether a mismatch means "simplify back toward the design" versus "revise the design itself"?

Those decisions will determine whether the rest of the loop can be built incrementally or whether it will turn into another overgrown abstraction project.
