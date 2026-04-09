# Simplify2 runtime/token postmortem

Date: 2026-04-09

Scope:
- Session: `61b8cf9a-9f68-4c76-a7d3-8bad23e18cce`
- Top-level simplify2 cell: `6fe6752f-d25b-47d8-adfc-67d7ed8350e6`
- Redirect / follow-up analysis cell: `1a63e17f-33fd-4994-b7fa-3e35c47165cc`
- This report diagnoses the **original `/simplify2` runtime and token burn**.
- The later 33 GB transcript blowup from searching `~/.nanoboss` was a **separate follow-up forensic failure**, not part of the original simplify2 runtime. That separate issue is now mitigated by blocking broad `~/.nanoboss` and `~/.nanoboss/agent-logs` access in downstream ACP permission handling.

Related raw inventory:
- Full per-command trace: [`plans/2026-04-09-simplify2-runtime-postmortem-commands.tsv`](./2026-04-09-simplify2-runtime-postmortem-commands.tsv)

## Executive summary

The simplify2 run took **56m43s** not because one tiny edit was slow, but because the procedure executed a **multi-iteration foreground loop** and effectively did **two overlapping simplification passes plus a third analysis pass** before pausing for approval.

What actually happened:
- simplify2 ran **16 fresh downstream agent sessions** under one top-level run.
- It completed **2 applied slices** and then started a **3rd iteration** that paused on a checkpoint.
- The two applied slices and the paused third slice all targeted **the same seam**:
  - iteration 1 applied **H3 — “Separate provenance memory from retrieval policy”**
  - iteration 2 applied **H1 — “Move MCP retrieval guidance fully into prompt assembly”**
  - iteration 3 proposed **H4 — “Decouple prior-work summary rendering from retrieval-policy attachment”**
- Both applied slices touched the same 4 files:
  - `src/core/memory-cards.ts`
  - `src/core/service.ts`
  - `tests/unit/memory-cards.test.ts`
  - `tests/unit/service.test.ts`
- So the final visible change looked small, but the system spent most of its time repeatedly re-analyzing and re-testing the same boundary.

Top-line metrics reconstructed from the stored run:
- Wall clock: **3403s / 56m43s**
- Sum of nested child-agent durations: **3263s / 54m23s**
- Nested child sessions: **16**
- Reconstructed tool calls inside child sessions: **494**
  - `read`: **367**
  - `search`: **86**
  - `execute`: **29**
  - `edit`: **9**
  - `fetch`: **3**
- Top-level replay stream events: **1974**
  - `tool_started`: **510**
  - `tool_updated`: **681**
  - `token_usage`: **767**
- Total child prompt text length (just the saved prompt bodies, before tool results): **132,389 chars**
- Largest reconstructed child-session context snapshot: **131,223 tokens**

The main diagnosis is:

1. **simplify2 is intentionally a bounded loop, not a one-shot edit**.
2. **Each phase is a fresh agent session**, so context is rebuilt from scratch.
3. **The loop did not recognize that H3, H1, and H4 were near-duplicates**.
4. **Iteration 2 paid a large validation tax**: six full test invocations, four of them failing before the final pass.
5. **Validation command choice drifted to `npm test`** in iteration 2, despite repo guidance preferring Bun.

## What simplify2 actually did

`simplify2` is documented as a structured loop, not a one-step refactor:

1. load simplify artifacts
2. refresh architecture memory
3. collect observations
4. generate and rank hypotheses
5. either pause, apply, or finish
6. after an apply, validate, reconcile memory, and repeat

This run followed that design literally.

### Iteration 1

- Refreshed architecture memory
- Scanned the repo for observations
- Generated hypotheses
- Ranked hypotheses
- Applied **H3: “Separate provenance memory from retrieval policy”**
- Validated the slice with Bun test runs
- Reconciled architecture memory and journal

Result: succeeded and continued into iteration 2.

### Iteration 2

- Refreshed architecture memory again
- Scanned the repo again
- Generated hypotheses again
- Ranked hypotheses again
- Applied **H1: “Move MCP retrieval guidance fully into prompt assembly”**
- Reworked the same files/tests as iteration 1
- Re-ran the trusted slice repeatedly while fixing test assumptions
- Reconciled architecture memory and journal

Result: succeeded and continued into iteration 3.

### Iteration 3

- Refreshed architecture memory again
- Scanned the repo again
- Generated hypotheses again
- Ranked hypotheses again
- Proposed **H4: “Decouple prior-work summary rendering from retrieval-policy attachment”**
- Paused for approval because risk was medium

Before the checkpoint was answered, the user redirected the run into retrospective analysis mode.

## Timeline by nested child agent

| Iter | Stage | Child cell | Duration | Max context seen | Tool mix | Notes |
| --- | --- | --- | ---: | ---: | --- | --- |
| 1 | architecture refresh | `8286ab5a-...` | 4m15s | 131,223 | 49 read / 8 search / 1 exec | Large repo/docs/test reread |
| 1 | observation scan | `8ad585fd-...` | 3m56s | 110,791 | 49 read / 7 search / 2 exec / 1 fetch | Another broad reread |
| 1 | hypothesis generation | `cbb9d76e-...` | 0m59s | 17,279 | no tools | Pure model step |
| 1 | ranking | `97cfcb12-...` | 3m04s | 73,825 | 26 read / 11 search / 1 exec / 1 fetch | Ranked candidates |
| 1 | apply H3 | `6dae2de8-...` | 5m23s | 63,672 | 17 read / 9 search / 7 exec / 1 edit | 3 Bun test runs |
| 1 | reconcile H3 | `68fb4599-...` | 0m24s | 16,079 | no tools | Memory/journal update |
| 2 | architecture refresh | `5ef2730f-...` | 4m10s | 99,861 | 38 read / 8 search / 1 exec | Fresh session, reread again |
| 2 | observation scan | `db2fc880-...` | 3m59s | 107,934 | 46 read / 8 search / 1 exec / 1 fetch | Fresh session, reread again |
| 2 | hypothesis generation | `4f333708-...` | 0m45s | 16,669 | no tools | Pure model step |
| 2 | ranking | `0d31febb-...` | 3m09s | 73,814 | 28 read / 13 search / 2 exec | More repo rereads |
| 2 | apply H1 | `d15cacab-...` | 13m55s | 70,402 | 23 read / 9 search / 14 exec / 8 edit | 6 test runs, 4 failures |
| 2 | reconcile H1 | `92a4ebd7-...` | 0m55s | 17,125 | no tools | Memory/journal update |
| 3 | architecture refresh | `5d8755c9-...` | 4m19s | 113,807 | 42 read / 4 search | Fresh session, reread again |
| 3 | observation scan | `d1a4dadf-...` | 3m40s | 108,868 | 49 read / 9 search | Fresh session, reread again |
| 3 | hypothesis generation | `06345391-...` | 0m55s | 17,414 | no tools | Pure model step |
| 3 | ranking | `f57da700-...` | 0m34s | 17,119 | no tools | Produced H4, then paused |

Category totals across the child sessions:
- Architecture refresh: **12.73 min** (**23.4%**)
- Observation scan: **11.59 min** (**21.3%**)
- Hypothesis generation: **2.66 min** (**4.9%**)
- Ranking: **6.78 min** (**12.5%**)
- Apply slices: **19.31 min** (**35.5%**)
- Reconciliation summaries: **1.32 min** (**2.4%**)

The key point: **44.7% of the total child-agent runtime was spent just re-refreshing architecture memory and rescanning the repo**.

## Why the run used so many tokens

### 1) Fresh agent sessions for every phase meant repeated context rebuilds

This was not one agent thinking continuously for an hour.

Each `ctx.callAgent(...)` call created a **new ACP session / new downstream transcript**. The stored evidence is 16 distinct agent-log files for this one simplify2 run. That means architecture refresh, observation scan, hypothesis generation, ranking, apply, and reconcile did **not share prior read context**.

Effect:
- each phase had to re-open the repo from scratch
- each phase re-read large overlapping slices of the same files/docs/tests
- token spend repeated across phases and across iterations

That is the single biggest structural reason the token usage felt disproportionate.

### 2) The loop repeatedly re-read the same seam

Across the three iterations, the child agents repeatedly opened the same files:
- `src/core/service.ts`
- `src/core/memory-cards.ts`
- `src/mcp/server.ts`
- `src/session/store.ts`
- `src/session/repository.ts`
- `src/procedure/dispatch-recovery.ts`
- multiple MCP/service/default-history tests
- several historical plans/docs

The nested-session counts show the pattern clearly:
- 3 architecture-refresh agents alone performed **129 reads + 20 searches + 2 execs**
- 3 observation-scan agents performed **144 reads + 24 searches + 4 exec/fetches**

Those two categories alone account for **~24.3 minutes** and a very large portion of the token accumulation.

### 3) The loop chased near-duplicate hypotheses instead of recognizing overlap

The three successive hypotheses were semantically extremely close:
- **H3** — separate provenance memory from retrieval policy
- **H1** — move MCP retrieval guidance fully into prompt assembly
- **H4** — decouple prior-work summary rendering from retrieval-policy attachment

Evidence that they were overlapping, not distinct:
- iteration 1 and iteration 2 both touched the exact same 4 files
- iteration 3 proposed another change on the same seam
- the user-visible end state was still “clean up memory-card guidance ownership,” i.e. one conceptual area

So simplify2 effectively:
- applied one slice in this seam
- re-analyzed the same seam
- applied a second slice in the same seam
- re-analyzed the same seam again
- proposed a third slice in the same seam

This is why the final diff felt much smaller than the runtime implied.

### 4) Iteration 2 paid a heavy validation/retry tax

The second apply step (`d15cacab-...`) was the single most expensive child session: **13m55s**.

Most of that was repeated test execution.

Reconstructed validation sequence:
- initial trusted-slice run: **completed**
- rerun 1: **failed**
- rerun 2: **failed**
- rerun 3: **failed**
- rerun 4: **failed**
- final rerun: **passed**

That one child session spent about:
- **588.8s / 9m49s** inside test commands alone
- with **6 total full suite invocations**

The stored child transcript explains why it kept retrying:
- first it changed prompt-composition ownership
- then a service test asserted the wrong observable seam
- then a spy/env setup bug remained
- then the run discovered a real nuance: slash-dispatch results are synced immediately, so they were not a valid unsynced-memory-card test fixture
- eventually the test was rewritten to seed an unsynced durable cell directly

In other words, iteration 2 was not one clean edit; it was a multi-step test-debugging loop.

### 5) Validation command choice drifted to `npm test`

The repo instructions and `docs/simplify2.md` both say the validation slice should run with Bun:

```text
bun test <selected test files>
```

But iteration 2 repeatedly ran:

```text
npm test -- tests/unit/mcp-format.test.ts tests/unit/mcp-registration.test.ts tests/unit/mcp-server.test.ts tests/unit/mcp-stdio.test.ts tests/unit/service.test.ts tests/unit/memory-cards.test.ts
```

That matters because:
- it diverged from project guidance
- it expanded the validation loop cost
- it was repeated 6 times inside the most expensive child session

### 6) Prompt size and context inflation were real

Even before tool outputs were added, the saved child prompts totaled **132,389 characters**.

The ranking prompts were especially large:
- iteration 1 ranking prompt: **15,022 chars**
- iteration 2 ranking prompt: **12,814 chars**
- iteration 3 ranking prompt: **15,132 chars**

Those prompts included architecture summaries, notebook observations, and large hypothesis JSON blobs. Then the child agents read many files on top of that. The resulting session-context snapshots climbed as high as **131,223 tokens**.

So even without an exact billing total, the token burn pattern is consistent with the stored evidence: repeated large prompts + repeated large file reads + repeated fresh sessions.

## Why the visible change looked small

By the time the run paused, the human-visible state mostly looked like one narrow refactor around prompt guidance ownership. But the machine had already spent time on:
- one applied slice in that seam
- a second applied slice in that seam
- a third candidate in that seam
- repeated test debugging around that seam

So the **visible final delta compressed the history**.

This is the core mismatch between user perception and runtime cost:
- **user perception:** “small straightforward answer / small straightforward code cleanup”
- **actual procedure behavior:** “multi-pass architecture review + hypothesis loop + repeated validation + checkpointing on the same boundary”

## Significant execute-command log

The complete per-command trace is in the TSV appendix. These were the execute commands with the highest runtime impact.

### Iteration 1 apply (H3)

1. `bun test tests/e2e/default-history-agents.test.ts tests/e2e/procedure-dispatch-recovery.test.ts tests/unit/default-memory-bridge.test.ts tests/unit/mcp-format.test.ts tests/unit/mcp-registration.test.ts tests/unit/mcp-server.test.ts`
2. `bun test tests/unit/memory-cards.test.ts tests/unit/service.test.ts`
3. `bun test tests/e2e/default-history-agents.test.ts tests/e2e/procedure-dispatch-recovery.test.ts tests/unit/default-memory-bridge.test.ts tests/unit/mcp-format.test.ts tests/unit/mcp-registration.test.ts tests/unit/mcp-server.test.ts`

Small low-cost helpers around that apply:
- `git diff -- src/core/memory-cards.ts src/core/service.ts tests/unit/memory-cards.test.ts tests/unit/service.test.ts`
- `git status --short -- src/core/memory-cards.ts src/core/service.ts tests/unit/memory-cards.test.ts tests/unit/service.test.ts`
- two failed `rg` commands while refining a search pattern

### Iteration 2 apply (H1)

1. `npm test -- tests/unit/mcp-format.test.ts tests/unit/mcp-registration.test.ts tests/unit/mcp-server.test.ts tests/unit/mcp-stdio.test.ts tests/unit/service.test.ts tests/unit/memory-cards.test.ts` (baseline trusted slice, passed)
2. same `npm test -- ...` command (failed)
3. same `npm test -- ...` command (failed)
4. same `npm test -- ...` command (failed)
5. same `npm test -- ...` command (failed)
6. same `npm test -- ...` command (final pass)

Small low-cost helpers around that apply:
- `git status --short`
- `git diff -- src/core/memory-cards.ts`
- `git diff -- src/core/service.ts`
- `git diff -- tests/unit/memory-cards.test.ts`
- `git diff -- tests/unit/service.test.ts`
- `git diff -- src/core/memory-cards.ts src/core/service.ts tests/unit/memory-cards.test.ts tests/unit/service.test.ts`

## Root causes

### Primary

1. **Procedure shape mismatch**
   - simplify2 is a structured multi-step loop with repeated subagents, not a single cheap edit pass.

2. **No context reuse between phases**
   - every phase/iteration rebuilt context in a fresh downstream session.

3. **Hypothesis overlap was not suppressed**
   - H3 → H1 → H4 should likely have been treated as one seam with diminishing returns.

4. **Validation churn**
   - iteration 2 paid nearly 10 minutes of test reruns alone.

### Secondary

5. **Validation command drift**
   - iteration 2 used `npm test` instead of Bun.

6. **Prompt + repo-read inflation**
   - large structured prompts plus dozens of file reads pushed child sessions well into 70k–130k context-token snapshots.

## Recommendations

1. **Add hypothesis overlap suppression**
   - if the next hypothesis touches the same files/seam as an already-applied hypothesis, either downgrade its score sharply or checkpoint immediately.

2. **Cache/reuse architecture and observation results across iterations**
   - do not launch a fresh architecture-refresh + repo-scan pair on every iteration unless the working set actually changed in a way that invalidates prior observations.

3. **Checkpoint earlier on repeated same-seam proposals**
   - H3, H1, and H4 were too similar to justify two applies and a third full analysis cycle.

4. **Enforce Bun in simplify2 validation**
   - the procedure docs already say `bun test`; the apply prompt or validation executor should make that deterministic.

5. **Cap validation retries per apply step**
   - after N failures, stop and ask for guidance instead of burning more minutes on near-identical reruns.

6. **Consider phase fusion**
   - architecture refresh + observation scan + ranking could likely share one child session or a cached evidence bundle instead of starting over each time.

## Bottom line

The run was expensive because simplify2 did what it is currently designed to do:
- structured multi-agent looping
- repeated fresh-session analysis
- repeated validation
- checkpointing after multiple passes

But this particular run also exposed an inefficiency in the loop policy:
- it spent nearly an hour on **three versions of the same conceptual simplification seam**.

So the answer to “why did it take nearly an hour for a relatively small change?” is:

> Because the visible final diff was the product of **two full applied iterations plus a third analysis iteration**, each composed of fresh high-context subagents, and the loop failed to recognize early that the successive hypotheses were mostly overlapping refinements of the same change.

## Evidence used

Primary stored evidence:
- `~/.nanoboss/sessions/61b8cf9a-9f68-4c76-a7d3-8bad23e18cce/session.json`
- `~/.nanoboss/sessions/61b8cf9a-9f68-4c76-a7d3-8bad23e18cce/cells/1775696034447-6fe6752f-d25b-47d8-adfc-67d7ed8350e6.json`
- `~/.nanoboss/sessions/61b8cf9a-9f68-4c76-a7d3-8bad23e18cce/cells/1775693762577-68fb4599-2da9-4774-8cc2-8587b0135f5e.json`
- `~/.nanoboss/sessions/61b8cf9a-9f68-4c76-a7d3-8bad23e18cce/cells/1775695320141-d15cacab-ea4f-4599-af2d-298ce71b785c.json`
- `~/.nanoboss/sessions/61b8cf9a-9f68-4c76-a7d3-8bad23e18cce/cells/1775695465509-92a4ebd7-4fb8-4e26-85ca-ee1c809519cc.json`
- the 16 referenced child agent logs under `~/.nanoboss/agent-logs/*.jsonl`

Code/docs consulted for expected behavior:
- `docs/simplify2.md`
- `procedures/simplify2.ts`
- `src/agent/call-agent.ts`
