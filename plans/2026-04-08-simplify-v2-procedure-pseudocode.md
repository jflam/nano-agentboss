# `/simplify` v2 implementation sketch

This document makes the model-based `/simplify` plan concrete in nanoboss terms.

This is the implementation companion to [plans/2026-04-08-model-based-simplify-loop-plan.md](/Users/jflam/agentboss/workspaces/nanoboss/plans/2026-04-08-model-based-simplify-loop-plan.md).

Use the pair like this:

- read the overview plan for the design goals and operating principles
- read this document for the deterministic loop, state shape, and prompt patterns
- keep this document close to the actual implementation as the code evolves

The key constraint is the nanoboss procedure model:

- a procedure is a deterministic state machine
- it may call agents
- it may call other procedures or internal helpers
- it may pause with durable state
- it resumes later from that exact durable state

So `/simplify` v2 should not be imagined as one giant autonomous stream of thought. It should be implemented as a deterministic orchestration loop wrapped around bounded agent calls plus explicit state updates.

That means the architecture should separate:

- deterministic orchestration
- structured durable state
- typed agent subproblems
- human checkpoints

## Reading guide

This document is organized in four layers:

1. procedure shape
2. durable state
3. deterministic helper flow
4. agent prompt patterns

If you are implementing the feature, the fastest useful reading order is:

1. high-level shape
2. proposed procedure state
3. execution path
4. resume path
5. test slice selection
6. design evolution protocol
7. prompt examples

---

## High-level shape

At a high level, `/simplify` v2 should look like this:

```ts
procedure execute(userPrompt, ctx):
  state = initializeState(userPrompt)
  state = loadRepoArtifacts(state, ctx)
  state = openOrResumeNotebook(state, ctx)
  state = refreshArchitectureMemory(state, ctx)
  state = scanTouchedOrRelevantAreas(state, ctx)
  state = generateHypotheses(state, ctx)
  state = rankHypotheses(state, ctx)

  nextAction = decideNextAction(state)

  if nextAction.kind == "pause_for_human":
    return buildPausedResult(state, nextAction.question)

  if nextAction.kind == "apply_change":
    state = applySimplificationSlice(state, nextAction.hypothesis, ctx)
    state = validateAndReconcile(state, ctx)
    return continueOrPause(state)

  if nextAction.kind == "finish":
    return buildFinishedResult(state)
```

The important thing is that every state transition is deterministic and explicit. Agent calls are used only for bounded inference tasks:

- classify observations
- extract concepts and invariants
- generate hypotheses
- interpret the human reply
- produce implementation instructions
- summarize conceptual deltas

The procedure itself owns:

- state layout
- phase order
- persistence
- checkpoint rules
- validation policy
- journal updates

---

## Proposed procedure state

The first implementation should use one durable state object with clearly separated sub-objects.

```ts
interface SimplifyV2State {
  version: 1;
  originalPrompt: string;
  iteration: number;
  mode: "explore" | "checkpoint" | "apply" | "reconcile" | "finished";

  focus: {
    scope?: string[];
    exclusions?: string[];
    goals: string[];
    constraints: string[];
  };

  artifacts: {
    architectureMemoryRef?: ValueRef;
    notebookRef?: ValueRef;
    journalRef?: ValueRef;
    latestTestMapRef?: ValueRef;
  };

  memorySnapshot: {
    concepts: string[];
    invariants: string[];
    boundaries: string[];
    exceptions: string[];
    openHypothesisIds: string[];
  };

  notebook: {
    threadId: string;
    status: "active" | "awaiting_human" | "closed";
    observations: SimplifyObservation[];
    candidateHypotheses: SimplifyHypothesis[];
    openQuestions: SimplifyQuestion[];
    currentCheckpoint?: SimplifyCheckpoint;
  };

  testContext: {
    changedSubsystems: string[];
    selectedSlice: TestSliceSelection[];
    lastValidation?: ValidationSummary;
  };

  history: {
    journalEntryIds: string[];
    appliedHypothesisIds: string[];
    rejectedHypothesisIds: string[];
  };
}
```

Important design note:

The state object is not the entire memory system. It is the procedure's working handle on durable artifacts. Large artifacts can live in refs or repo-visible files and be loaded or summarized into the state.

Another important note:

This is intentionally a working v1 shape, not a final schema. The procedure should start with one clear state object even if some sub-objects later move into more specialized durable artifacts.

---

## Supporting types

```ts
interface SimplifyObservation {
  id: string;
  kind:
    | "concept_candidate"
    | "invariant_candidate"
    | "boundary_candidate"
    | "exception_candidate"
    | "duplication"
    | "test_smell"
    | "architecture_drift"
    | "design_evolution_signal";
  summary: string;
  evidence: EvidenceRef[];
  confidence: "low" | "medium" | "high";
}

interface SimplifyHypothesis {
  id: string;
  title: string;
  kind:
    | "merge_concepts"
    | "collapse_boundary"
    | "centralize_invariant"
    | "remove_exception"
    | "canonicalize_representation"
    | "simplify_tests"
    | "design_update";
  summary: string;
  rationale: string;
  evidence: EvidenceRef[];
  expectedDelta: {
    conceptsReduced?: number;
    boundariesReduced?: number;
    exceptionsReduced?: number;
    duplicateRepresentationsReduced?: number;
    testRuntimeDelta?: "lower" | "neutral" | "higher";
  };
  risk: "low" | "medium" | "high";
  needsHumanCheckpoint: boolean;
  checkpointReason?: string;
  implementationScope: string[];
  testImplications: string[];
  score: number;
}

interface SimplifyCheckpoint {
  hypothesisId: string;
  kind:
    | "concept_merge"
    | "canonical_representation"
    | "boundary_challenge"
    | "exception_legitimacy"
    | "design_update";
  question: string;
  options?: string[];
}

interface SimplifyQuestion {
  id: string;
  prompt: string;
  kind: "human_checkpoint" | "research_followup" | "validation_gap";
}

interface EvidenceRef {
  kind: "file" | "test" | "doc" | "commit" | "journal";
  ref: string;
  note?: string;
}

interface TestSliceSelection {
  testId: string;
  path: string;
  class:
    | "invariant"
    | "boundary_contract"
    | "state_machine"
    | "exception_regression"
    | "smoke"
    | "integration"
    | "incidental_surface";
  reason: string;
  confidence: "explicit" | "inferred_high_confidence" | "inferred_low_confidence";
  tier: 1 | 2 | 3;
}

interface ValidationSummary {
  tierRun: 1 | 2 | 3;
  passed: boolean;
  ran: string[];
  failed: string[];
  notes: string[];
}
```

---

## Deterministic phase machine

The simplest robust design is to give the procedure explicit named phases rather than letting one agent response implicitly drive everything.

```ts
function decideNextAction(state: SimplifyV2State): NextAction {
  if (state.notebook.currentCheckpoint) {
    return {
      kind: "pause_for_human",
      question: state.notebook.currentCheckpoint.question,
    };
  }

  const best = highestScoringOpenHypothesis(state.notebook.candidateHypotheses);
  if (!best) {
    return { kind: "finish", reason: "No worthwhile hypothesis remains." };
  }

  if (best.needsHumanCheckpoint) {
    return {
      kind: "pause_for_human",
      question: buildCheckpointQuestion(best),
    };
  }

  return {
    kind: "apply_change",
    hypothesis: best,
  };
}
```

This is the pattern to preserve throughout the implementation:

- agent responses produce structured proposals
- nanoboss deterministic logic decides what state transition happens next

This is the core guardrail for the whole feature. If the implementation starts letting an agent implicitly choose the next phase, the procedure will become harder to debug, harder to resume, and harder to trust.

---

## Execution path

### `execute(prompt, ctx)`

The initial execution should perform one bounded cycle of analysis and then pause with a concrete next step.

```ts
async function execute(prompt: string, ctx: CommandContext): Promise<ProcedureResult> {
  let state = initializeState(prompt);

  ctx.print("Loading simplify memory and opening a notebook...\n");
  state = await loadArtifacts(state, ctx);
  state = await resumeOrCreateNotebook(state, ctx);

  ctx.print("Refreshing architecture memory for the current focus...\n");
  state = await refreshArchitectureMemory(state, ctx);

  ctx.print("Scanning the repository for conceptual simplification opportunities...\n");
  state = await collectObservations(state, ctx);

  ctx.print("Generating and ranking simplification hypotheses...\n");
  state = await generateAndRankHypotheses(state, ctx);

  const next = decideNextAction(state);
  if (next.kind === "finish") {
    return buildFinishedResult(state, next.reason);
  }

  if (next.kind === "apply_change") {
    ctx.print(`Applying ${next.hypothesis.title}...\n`);
    state = await applySimplificationSlice(state, next.hypothesis, ctx);
    state = await validateAndReconcile(state, ctx);
    return maybePauseOrFinishAfterApply(state);
  }

  return buildPausedResult(state, next.question);
}
```

This keeps the first iteration productive while still allowing a checkpoint before risky semantic decisions.

In practice, that means `execute(...)` should usually do enough work to produce one of three outcomes:

- a concrete checkpoint for the human
- one applied low-risk simplification plus reconciliation
- a principled finish because nothing worthwhile stands out

---

## Resume path

### `resume(prompt, state, ctx)`

Resumption should not just mean "continue". It should explicitly interpret the human reply, update state, and then continue the deterministic loop.

```ts
async function resume(prompt: string, rawState: KernelValue, ctx: CommandContext): Promise<ProcedureResult> {
  let state = requireSimplifyV2State(rawState);

  ctx.print(`Interpreting simplify guidance for iteration ${state.iteration}...\n`);
  const decision = await interpretHumanReply(prompt, state, ctx);

  state = applyHumanDecision(state, decision);
  state = await appendJournalForHumanDecision(state, decision, ctx);

  if (decision.kind === "stop") {
    return buildFinishedResult(state, decision.reason);
  }

  if (decision.kind === "design_update") {
    state = await reviseArchitectureMemory(state, decision.designUpdate, ctx);
  }

  if (decision.kind === "redirect") {
    state = applyRedirect(state, decision);
    state = await collectObservations(state, ctx);
    state = await generateAndRankHypotheses(state, ctx);
  }

  if (decision.kind === "approve_hypothesis") {
    const hypothesis = findHypothesis(state, decision.hypothesisId);
    state = await applySimplificationSlice(state, hypothesis, ctx);
    state = await validateAndReconcile(state, ctx);
  }

  return maybePauseOrFinishAfterApply(state);
}
```

The important design choice here is that the human reply is interpreted into a typed decision first. The rest of the flow stays deterministic.

---

## Core helper functions

### 1. Load artifacts

This phase is deterministic. It reads existing durable memory and summarizes it into the procedure state.

```ts
async function loadArtifacts(state, ctx) {
  const architectureMemory = await loadArchitectureMemory(ctx.cwd, ctx);
  const journal = await loadSimplifyJournal(ctx.cwd, ctx);
  const latestTestMap = await loadTestMap(ctx.cwd, ctx);

  state.artifacts.architectureMemoryRef = architectureMemory.ref;
  state.artifacts.journalRef = journal.ref;
  state.artifacts.latestTestMapRef = latestTestMap.ref;

  state.memorySnapshot = summarizeArchitectureMemory(architectureMemory.value);
  return state;
}
```

This helper should not call an agent. It is deterministic data access plus summarization.

### 2. Refresh architecture memory

This phase may use an agent, but only to propose updates from evidence. The procedure decides whether to adopt those updates.

```ts
async function refreshArchitectureMemory(state, ctx) {
  const refreshProposal = await ctx.callAgent(
    buildArchitectureRefreshPrompt(state),
    ArchitectureRefreshProposalType,
    { stream: false },
  );

  const proposal = expectData(refreshProposal, "Missing architecture refresh proposal");
  state = mergeRefreshProposalIntoNotebook(state, proposal);
  return state;
}
```

### 3. Collect observations

The goal is not "find a patch." The goal is to produce typed observations about concepts, boundaries, invariants, tests, and drift.

```ts
async function collectObservations(state, ctx) {
  const observationResult = await ctx.callAgent(
    buildObservationPrompt(state),
    ObservationBatchType,
    { stream: false },
  );

  const batch = expectData(observationResult, "Missing observation batch");
  state.notebook.observations = dedupeObservations([
    ...state.notebook.observations,
    ...batch.observations,
  ]);
  return state;
}
```

### 4. Generate hypotheses

```ts
async function generateAndRankHypotheses(state, ctx) {
  const hypothesisResult = await ctx.callAgent(
    buildHypothesisPrompt(state),
    HypothesisBatchType,
    { stream: false },
  );

  const rankingResult = await ctx.callAgent(
    buildHypothesisRankingPrompt(state, expectData(hypothesisResult, "Missing hypotheses")),
    HypothesisRankingType,
    { stream: false },
  );

  state.notebook.candidateHypotheses = reconcileRankedHypotheses(
    expectData(hypothesisResult, "Missing hypotheses"),
    expectData(rankingResult, "Missing hypothesis rankings"),
  );

  state.notebook.currentCheckpoint = maybeCreateCheckpoint(state.notebook.candidateHypotheses);
  return state;
}
```

This is two agent calls rather than one on purpose:

- one call generates hypotheses
- one call scores and compares them

That separation makes it easier to debug and iterate.

It also creates a cleaner seam for later experiments. If hypothesis generation is good but ranking is weak, the two can be improved independently.

### 5. Apply simplification slice

The apply phase should itself be split into deterministic prework, an agent implementation task, and deterministic post-processing.

```ts
async function applySimplificationSlice(state, hypothesis, ctx) {
  state.mode = "apply";

  const selectedTests = await selectMinimalTrustedTestSlice(state, hypothesis, ctx);
  state.testContext.selectedSlice = selectedTests;

  const applyResult = await ctx.callAgent(
    buildApplyPrompt(state, hypothesis, selectedTests),
    SimplifyApplyResultType,
    { stream: false },
  );

  const applied = expectData(applyResult, "Missing apply result");
  state = recordAppliedHypothesis(state, hypothesis, applied);
  state = updateNotebookAfterApply(state, hypothesis, applied);
  return state;
}
```

The apply prompt should force the agent to:

- delete or collapse before abstracting
- update tests in the same conceptual direction
- report touched files
- report conceptual changes

The apply phase should stay narrow. If a hypothesis requires a broad rewrite or starts touching unrelated areas, that is usually a sign that the hypothesis was underspecified or wrongly scoped.

### 6. Validate and reconcile

```ts
async function validateAndReconcile(state, ctx) {
  state.mode = "reconcile";

  const validation = await runSelectedValidation(state.testContext.selectedSlice, ctx);
  state.testContext.lastValidation = validation;

  const reconciliation = await ctx.callAgent(
    buildReconciliationPrompt(state, validation),
    ReconciliationResultType,
    { stream: false },
  );

  const result = expectData(reconciliation, "Missing reconciliation result");
  state = applyReconciliationResult(state, result);
  state = appendJournalAfterApply(state, result, validation);
  state.iteration += 1;
  return state;
}
```

This is where the procedure updates:

- architecture memory
- notebook status
- journal
- test mapping confidence

This reconciliation step is what keeps the loop cumulative. Without it, the procedure would make edits but fail to improve its own model of the repo.

---

## Test slice selection

This part should be deterministic as much as possible.

The procedure should maintain a code-to-test map and use it to select a minimal trusted slice.

```ts
async function selectMinimalTrustedTestSlice(state, hypothesis, ctx): Promise<TestSliceSelection[]> {
  const map = await loadTestMapFromRef(state.artifacts.latestTestMapRef, ctx);

  const relevantInvariantIds = inferRelevantInvariantIds(state, hypothesis);
  const relevantBoundaryIds = inferRelevantBoundaryIds(state, hypothesis);
  const relevantExceptionIds = inferRelevantExceptionIds(state, hypothesis);
  const relevantSubsystems = inferRelevantSubsystems(hypothesis);

  const selected = [];

  selected.push(...map.tests.filter(matchesInvariant(relevantInvariantIds)));
  selected.push(...map.tests.filter(matchesBoundary(relevantBoundaryIds)));
  selected.push(...map.tests.filter(matchesException(relevantExceptionIds)));
  selected.push(...map.tests.filter(matchesSubsystemSmoke(relevantSubsystems)));

  return dedupeAndRankTestSelections(selected);
}
```

When confidence is low, the deterministic selector can ask the agent for help:

```ts
if (selectionConfidence(selected) === "low") {
  const suggestion = await ctx.callAgent(
    buildTestSliceSuggestionPrompt(state, hypothesis, selected),
    TestSliceSuggestionType,
    { stream: false },
  );
  selected = mergeTestSliceSuggestion(selected, expectData(suggestion, "Missing test slice suggestion"));
}
```

The pattern remains the same:

- deterministic selector first
- agent only as bounded fallback or refinement

That ordering matters. Test selection should be reviewable and explainable. The agent is useful for refinement, but it should not become the only source of test choice.

---

## Design evolution protocol

One of the most important parts of the design is allowing the architecture model to change rationally.

This means the procedure needs explicit branching when it detects a mismatch between current architecture memory and observed pressure from the code or requirements.

```ts
function classifyDesignMismatch(state, hypothesis): "drift" | "evolution" | "unclear" {
  if (hypothesis.kind !== "design_update") {
    return "drift";
  }

  if (hasNewRequirementEvidence(hypothesis) || hasRepeatedPressureAcrossIterations(hypothesis)) {
    return "evolution";
  }

  return "unclear";
}
```

If the mismatch looks like evolution, the procedure should pause before implementation:

```ts
if (classifyDesignMismatch(state, bestHypothesis) === "evolution") {
  state.notebook.currentCheckpoint = {
    hypothesisId: bestHypothesis.id,
    kind: "design_update",
    question: buildDesignUpdateQuestion(bestHypothesis),
  };
  return buildPausedResult(state, state.notebook.currentCheckpoint.question);
}
```

This keeps the procedure from smuggling design changes through code-only refactors.

That point is easy to miss. A strong simplifier should not silently "fix" the code by changing the intended design underneath it. If the model needs to change, the procedure should surface that explicitly.

---

## Agent prompt examples

The prompts below are deliberately long and opinionated. The point is to constrain the agent tightly so the deterministic loop stays reliable.

Treat these prompts as templates, not sacred text. Their job is to show the shape of the subproblems and the kind of structured outputs the procedure should demand.

### A. Architecture refresh prompt

```text
You are helping maintain a durable architectural memory for the current repository.

Your task is not to propose code edits yet.
Your task is to review the current architectural memory snapshot, compare it against the current repository, and return a JSON object with:

- `newObservations`
- `staleItems`
- `suspectConceptMerges`
- `suspectBoundaryCollapses`
- `invariantCandidates`
- `designEvolutionSignals`

Rules:
- Focus on concepts, invariants, boundaries, exceptions, and duplicate representations.
- Prefer semantic observations over file-level commentary.
- Mark uncertainty explicitly.
- Do not propose implementation instructions yet.
- Return JSON only.

Current focus:
{focus}

Architecture memory summary:
{memorySummary}

Recent journal highlights:
{journalSummary}

Recent commits:
{recentCommits}

Relevant files:
{relevantFileList}
```

Desired response shape:

```json
{
  "newObservations": [
    {
      "kind": "boundary_candidate",
      "summary": "The session repository and service layers both appear to own session continuation parsing.",
      "evidence": [
        { "kind": "file", "ref": "src/session/repository.ts" },
        { "kind": "file", "ref": "src/core/service.ts" }
      ],
      "confidence": "medium"
    }
  ],
  "staleItems": [],
  "suspectConceptMerges": [],
  "suspectBoundaryCollapses": [],
  "invariantCandidates": [],
  "designEvolutionSignals": []
}
```

### B. Observation prompt

```text
You are scanning the repository for conceptual simplification observations.

Return JSON only with one field: `observations`.

Each observation must be one of:
- `concept_candidate`
- `invariant_candidate`
- `boundary_candidate`
- `exception_candidate`
- `duplication`
- `test_smell`
- `architecture_drift`
- `design_evolution_signal`

Focus:
- identify accidental distinctions
- identify implicit or duplicated invariants
- identify fake boundaries or translation layers
- identify tests that preserve incidental surface complexity
- identify areas where the current architecture memory may be stale

Do not propose patches yet.
Do not return vague style advice.

Current focus:
{focus}

Architecture memory summary:
{memorySummary}

Notebook context:
{notebookSummary}

Relevant files and tests:
{relevantInputs}
```

### C. Hypothesis generation prompt

```text
You are generating simplification hypotheses from structured observations.

Return JSON only with one field: `hypotheses`.

Generate 3 to 7 hypotheses.
Prefer hypotheses that reduce:
- accidental concepts
- accidental boundaries
- exception leakage
- duplicate representations
- test runtime caused by semantic duplication

Avoid:
- introducing new abstraction layers
- broad rewrites without a tight semantic core
- preserving duplicate surfaces under a wrapper

Each hypothesis must include:
- `id`
- `title`
- `kind`
- `summary`
- `rationale`
- `evidence`
- `expectedDelta`
- `risk`
- `needsHumanCheckpoint`
- `checkpointReason`
- `implementationScope`
- `testImplications`

Architecture memory summary:
{memorySummary}

Current notebook observations:
{observationSummary}

Test mapping summary:
{testMapSummary}
```

Example desired hypothesis:

```json
{
  "id": "hyp-merge-session-repo-surface",
  "title": "Collapse duplicate session continuation parsing ownership",
  "kind": "collapse_boundary",
  "summary": "The session repository and service layer both encode parts of the same continuation parsing responsibility.",
  "rationale": "This creates a fake boundary and duplicates invariant enforcement around paused procedure continuation state.",
  "evidence": [
    { "kind": "file", "ref": "src/session/repository.ts" },
    { "kind": "file", "ref": "src/core/service.ts" }
  ],
  "expectedDelta": {
    "boundariesReduced": 1,
    "duplicateRepresentationsReduced": 1
  },
  "risk": "medium",
  "needsHumanCheckpoint": false,
  "implementationScope": [
    "src/session/repository.ts",
    "src/core/service.ts",
    "tests/unit/current-session.test.ts"
  ],
  "testImplications": [
    "remove tests that pin duplicate parsing paths",
    "strengthen invariant tests around continuation persistence"
  ]
}
```

### D. Hypothesis ranking prompt

```text
You are ranking simplification hypotheses for implementation order.

Return JSON only with one field: `rankings`.

Score each hypothesis on:
- conceptual reduction
- confidence
- implementation risk
- test hardening value
- expected effect on future simplification

Prefer small-to-medium changes with high conceptual delta.
Penalize hypotheses that mainly rename complexity or add wrappers.

For each ranking entry include:
- `hypothesisId`
- `score`
- `reason`
- `needsHumanCheckpoint`

Hypotheses:
{hypothesesJson}
```

### E. Human reply interpretation prompt

```text
Interpret the user's reply about the current simplify checkpoint.

Return JSON only.

Allowed decision kinds:
- `approve_hypothesis`
- `reject_hypothesis`
- `redirect`
- `design_update`
- `stop`

Use `design_update` when the user is revising the intended architecture.
Use `redirect` when the user wants the search area or priority to change.

Current checkpoint:
{checkpoint}

Current best hypothesis:
{hypothesisSummary}

Current architecture memory:
{memorySummary}

User reply:
{userReply}
```

Example desired output:

```json
{
  "kind": "design_update",
  "reason": "The user wants to preserve the boundary because deployment constraints make it real.",
  "designUpdate": {
    "updateKind": "boundary_status_change",
    "boundaryId": "boundary-session-http",
    "newStatus": "canonical",
    "summary": "Keep the boundary explicit because it represents a real deployment edge."
  }
}
```

### F. Apply prompt

This is the most important prompt in the system because it determines whether `/simplify` actually improves taste.

```text
Apply one simplification slice directly in the repository.

You must follow these rules:

1. Prefer deleting, inlining, collapsing, or canonicalizing over introducing new abstraction layers.
2. Preserve behavior by strengthening semantic tests, not by preserving accidental structure.
3. Remove tests that only preserve deleted surface complexity.
4. Add or strengthen tests for surviving invariants and real boundaries.
5. Keep the change coherent and limited to the implementation scope.
6. Validate with the provided minimal trusted test slice first.
7. Return JSON only with:
   - `summary`
   - `touchedFiles`
   - `conceptualChanges`
   - `testChanges`
   - `validationNotes`

Overall simplify focus:
{focus}

Current architecture memory summary:
{memorySummary}

Selected hypothesis:
{hypothesisJson}

Selected minimal trusted test slice:
{selectedTestsJson}

Implementation scope:
{implementationScope}
```

Example desired output:

```json
{
  "summary": "Collapsed duplicate continuation parsing into the repository layer and removed tests that pinned the old split ownership.",
  "touchedFiles": [
    "src/session/repository.ts",
    "src/core/service.ts",
    "tests/unit/current-session.test.ts"
  ],
  "conceptualChanges": [
    "one owner now enforces continuation parsing invariants",
    "the service layer no longer mirrors repository parsing behavior"
  ],
  "testChanges": [
    "removed one duplicate surface test",
    "added one invariant-oriented persistence test"
  ],
  "validationNotes": [
    "minimal trusted slice passed"
  ]
}
```

The apply prompt is where "delete before abstract" has to become operational. If the prompt becomes vague here, the whole feature will drift back toward wrapper-heavy local safety behavior.

### G. Test slice suggestion prompt

```text
You are refining a minimal trusted validation slice for a repository change.

Return JSON only with one field: `suggestedTests`.

Your goal is to choose the smallest fast set of tests that protects the semantics of the change.

Prefer tests classified as:
- `invariant`
- `boundary_contract`
- `smoke`

Include `integration` tests only when the change touches shared orchestration or a real cross-subsystem contract.
Do not suggest broad full-suite validation unless clearly necessary.

Hypothesis:
{hypothesisJson}

Current inferred test slice:
{currentSelectedTestsJson}

Test map summary:
{testMapSummary}
```

### H. Reconciliation prompt

```text
Summarize the conceptual result of the applied simplification and propose updates to architecture memory and the journal.

Return JSON only with:
- `memoryUpdates`
- `journalSummary`
- `testMapUpdates`
- `followUpHypotheses`

Be explicit about:
- which concepts changed
- which invariants moved or became clearer
- which boundaries were removed or reinforced
- which tests were removed as incidental surface checks
- which tests were added as semantic guards

Applied change summary:
{applySummary}

Validation result:
{validationSummary}

Architecture memory before apply:
{preApplyMemorySummary}
```

---

## Sub-procedure composition option

If `/simplify` v2 becomes too large as one procedure, the implementation can still remain deterministic by splitting parts into helper procedures.

For example:

- `/simplify`
  Top-level orchestrator
- `/simplify/refresh-memory`
  Refresh architecture and test mappings
- `/simplify/review`
  Render memory, notebook, or journal views
- `/simplify/apply`
  Apply one selected hypothesis

The important rule would be:

- the top-level `/simplify` procedure owns the long-lived state machine
- helper procedures perform bounded deterministic subflows and return typed results

Pseudo-shape:

```ts
state = await ctx.callProcedure("/simplify/refresh-memory", input, TypedResult)
state = mergeRefreshResult(state, typedResult)
```

If helper procedures do not yet exist as first-class nested procedure calls, the same decomposition can exist as local helper functions first.

The design should not rush into sub-procedure decomposition. A single clear procedure with good helper functions is a better first implementation than a prematurely fragmented command family.

---

## Example end-to-end flow

Below is a compact example showing how a real interaction could run.

### User starts

```text
/simplify focus on procedure continuations and test speed
```

### Execute loop

```ts
state = initializeState(...)
state = loadArtifacts(...)
state = refreshArchitectureMemory(...)
state = collectObservations(...)
state = generateAndRankHypotheses(...)

best = {
  title: "Collapse duplicate continuation persistence tests",
  needsHumanCheckpoint: false
}

state = applySimplificationSlice(state, best, ctx)
state = validateAndReconcile(state, ctx)

next = decideNextAction(state)
```

### Procedure pauses

Displayed to user:

```text
Applied: Collapse duplicate continuation persistence tests.

Conceptual result:
- one invariant-oriented test now guards continuation persistence
- two semantically duplicate surface tests were removed

Next checkpoint:
The architecture memory suggests there may still be a fake boundary between session metadata parsing and service-level continuation handling.
Do you want to challenge that boundary now?
```

Pause state:

```json
{
  "mode": "checkpoint",
  "notebook": {
    "currentCheckpoint": {
      "hypothesisId": "hyp-collapse-continuation-boundary",
      "kind": "boundary_challenge",
      "question": "Do you want to challenge the boundary between session metadata parsing and service continuation handling?"
    }
  }
}
```

### User reply

```text
yes, but only if we can keep the public behavior unchanged and avoid broad rewrites
```

### Resume loop

```ts
decision = interpretHumanReply(...)
state = applyHumanDecision(...)
hypothesis = findHypothesis(...)
state = applySimplificationSlice(state, hypothesis, ctx)
state = validateAndReconcile(state, ctx)
return maybePauseOrFinishAfterApply(state)
```

---

## Suggested implementation order

The cleanest path is incremental.

### Step 1

Keep one procedure and add richer state:

- architecture memory handle
- notebook
- journal handle
- test map handle

Do not yet optimize storage architecture heavily.

### Step 2

Replace `findNextOpportunity(...)` with:

- `refreshArchitectureMemory(...)`
- `collectObservations(...)`
- `generateAndRankHypotheses(...)`

This is the real conceptual upgrade.

### Step 3

Add explicit checkpoint kinds:

- concept merge
- boundary challenge
- canonical representation
- design update

### Step 4

Add code-to-test map loading and minimal trusted slice selection.

### Step 5

Add reconciliation and memory updates after apply.

### Step 6

Only after the above works, consider breaking pieces into helper procedures.

If prioritization becomes necessary, the highest-leverage sequence is:

1. richer state
2. model-refresh plus hypothesis generation
3. semantic checkpoints
4. minimal trusted test slice selection
5. reconciliation and model updates

---

## Practical implementation rule

If one sentence had to govern the implementation, it would be:

`/simplify` v2 should be a deterministic state machine that uses agents to produce typed semantic proposals, not a freeform autonomous agent that happens to edit code.

That constraint is what will keep the feature inspectable, debuggable, and compatible with nanoboss's existing procedure model.
