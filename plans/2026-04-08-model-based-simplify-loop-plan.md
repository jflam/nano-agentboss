# A simpler plan for `/simplify`

**Essence:** `/simplify` should stop acting like a stateless cleanup command and start acting like a long-running design assistant. Its job is not just to remove duplicate code. Its job is to reduce the number of concepts, boundaries, representations, and exception paths the codebase has to carry.

This document is the short overview.

For the concrete implementation sketch, state shape, deterministic loop, and prompt examples, see [plans/2026-04-08-simplify-v2-procedure-pseudocode.md](/Users/jflam/agentboss/workspaces/nanoboss/plans/2026-04-08-simplify-v2-procedure-pseudocode.md).

Use the two documents differently:

* this plan explains the intent, design stance, and success criteria
* the pseudocode document explains how to build it inside nanoboss's procedure model

## 1. The problem

Today `/simplify` is good at local cleanup: deleting dead helpers, flattening small abstractions, trimming old compatibility layers, and removing duplicate code.

That is useful, but it only fixes surface problems.

The deeper problem in a growing codebase is usually not duplicate lines. It is duplicate ideas. Agents often preserve distinctions they do not understand, add wrappers instead of removing layers, and protect old boundaries instead of challenging them. The result is familiar: more concepts, more paths, more exceptions, and more code that feels careful in each patch but messier as a system.

So the next version of `/simplify` should target conceptual complexity, not just textual duplication.

## 2. The goal

`/simplify` should become a model-based simplifier.

That means it should build a durable picture of how the codebase is organized, use that picture to spot accidental complexity, ask the human when meaning is unclear, and keep learning from one run to the next.

The goal is simple:

* fewer concepts
* fewer duplicate representations
* fewer accidental boundaries
* fewer leaked exceptions
* fewer scattered invariant checks

The bias should be: understand first, delete before abstracting, choose one representation per concept, and centralize invariant enforcement.

## 3. The model it should use

To simplify a system well, `/simplify` should reason about five things:

* **concepts**: what exists
* **operations**: what acts on those things
* **invariants**: what must stay true
* **boundaries**: where representation, authority, storage, or transport changes
* **exceptions**: where the general rule stops holding

This gives the assistant a better target than “what code looks similar?”

Most accidental complexity comes from a small set of causes:

* two things that should really be one concept
* multiple representations of the same concept
* boundaries that exist for history, not for real need
* exceptions that have spread too far
* invariants enforced in many places instead of one place

That is the core simplification model.

## 4. What it must remember

A model-based simplifier cannot be stateless. It needs three separate kinds of memory.

**Architectural memory** is the stable model of the repo. It should record the main concepts, invariants, boundaries, exceptions, and current simplification hypotheses.

**Working notebook** is the scratchpad for one investigation. It can hold partial ideas, competing interpretations, open questions, and temporary rankings of candidate changes.

**Simplification journal** is the history. It should record what was scanned, what was believed, what was tried, what the human decided, what changed, and what validation ran.

These should stay separate.

If everything becomes canonical, the model fills with noise.
If everything stays scratch, nothing compounds.
If everything is only a log, the assistant has to reconstruct the present from old prose.

So the split is:

* architectural memory = current best model
* notebook = active reasoning
* journal = durable history

## 5. How the loop should run

With those three artifacts in place, `/simplify` can run a better loop.

First, it loads context. It reads the architectural memory, resumes or creates a notebook, and checks the journal for relevant past work.

Next, it scans the repo. It looks for core modules, repeated representations, branch-heavy exception zones, stale compatibility layers, key tests, and signs that the code has drifted from the current model.

Then it forms simplification hypotheses. For example:

* these two modules are really one concept
* this boundary is historical and can be removed
* these two representations should collapse into one
* this invariant is enforced in too many places
* this abstraction only hides duplication and should be inlined

Each hypothesis should say why it matters, what evidence supports it, what risk it carries, and what human judgment it needs.

Then it pauses at semantic checkpoints. The human should be involved when the assistant wants to merge concepts, choose a canonical representation, remove a boundary, or decide whether an exception is real.

After that, it applies one coherent simplification slice. The preferred moves are deletion, inlining, collapsing parallel paths, choosing one representation, and moving invariant checks to the right place. The assistant should be biased against generic wrappers, unnecessary compatibility layers, and abstractions created only to avoid touching the real code.

Finally, it validates the change, updates architectural memory, appends the journal, and either closes or continues the notebook thread.

That is the shift: from stateless cleanup to incremental design work.

## 6. How tests fit into this

Tests are not separate from simplification. They are one of the main places where complexity gets preserved or removed.

A good simplification strategy treats tests as protection for semantics, not structure.

Tests should mainly protect:

* invariants
* real boundary contracts
* real exceptional cases
* important state transitions
* a small set of cheap smoke paths

Tests that only preserve current helper structure, wrapper layers, duplicate surfaces, or internal decomposition are usually simplification targets.

To make this practical, `/simplify` should keep a rough model of what each test protects. That model does not have to be perfect. A useful first version can map tests to concepts, invariants, boundaries, exceptions, and subsystems with a mix of inference and light metadata.

That enables tiered validation:

* a fast local slice for the changed invariants and boundaries
* a broader subsystem slice before finishing a simplification
* the full suite for major changes or CI

The goal is not “more tests.” The goal is a sharper test suite: fewer redundant stories, more concentrated semantic coverage, and faster trusted validation.

## 7. How the codebase stays healthy between `/simplify` runs

Cleanup after the fact is not enough. The system also needs backpressure during normal coding.

That means ordinary changes should resist accidental complexity as it appears. New concepts, new boundaries, new options, and new exceptions should need a short justification. Every coding task should end with a small local simplify pass over the touched area. Obsolete tests should die with obsolete code. New tests should say what invariant, boundary, or exception they protect.

This keeps `/simplify` from becoming a janitor for mess that should never have landed.

At the same time, architectural memory must stay revisable. It is the current best model of the system, not doctrine.

So `/simplify` has to distinguish two cases:

**Drift** means the code moved away from the intended design without a good reason. In that case, simplify back toward the model.

**Evolution** means the model itself is wrong or outdated because requirements changed or a distinction turned out to be real. In that case, update the model first, then align code and tests to it.

That keeps design change intentional instead of accidental.

## 8. What v1 should build

The first version does not need perfect architecture inference or full program analysis. It only needs enough structure to stop starting from zero every time.

A practical v1 should do five things:

1. Add the three artifact types as separate first-class data structures.
2. Let the user inspect them in conversation.
3. Generate opportunities by updating the model first, then proposing changes against that model.
4. Pause for human judgment at semantic checkpoints.
5. Reconcile the model after every accepted simplification.

The storage can be simple. A good starting shape is hybrid: keep the notebook and journal in durable tool state, and keep architectural memory exportable, and possibly repo-visible, so it can be reviewed like code.

The first implementation should also stay honest about role separation:

* this overview should remain short
* detailed state shapes, prompt design, and orchestration logic should live in the pseudocode spec
* if the implementation drifts, update the pseudocode spec before or alongside the code

## 9. What success looks like

This approach is working if `/simplify` can reliably do these things:

* explain the repo in terms of concepts, invariants, boundaries, and exceptions
* show what it currently believes without confusing that with settled truth
* remember what it tried and learned across runs
* ask the human before making semantic merges or removing real boundaries
* reduce the number of concepts and paths in the system instead of hiding them behind new wrappers

That is the real goal.

Not cleaner patches.
A simpler system.
