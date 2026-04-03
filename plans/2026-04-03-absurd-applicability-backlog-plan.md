# Absurd applicability to nanoboss

> **Backlog plan:** This is a speculative backlog note, not an active implementation recommendation.

## Question

Is [Absurd](https://earendil-works.github.io/absurd/quickstart/) applicable to nanoboss?

## Short answer

Partially.

Absurd looks potentially useful as a **future background durable-workflow layer**, but it is **not a good fit for nanoboss's core interactive runtime** as it exists today.

## What Absurd provides

From the quickstart, Absurd is a Postgres-native durable workflow system built around:

- installing a SQL schema into PostgreSQL
- creating named queues
- registering worker tasks
- checkpointed steps like `ctx.step(...)`
- retrying failed tasks without re-running completed steps
- durable waiting via `awaitEvent(...)`
- later result inspection via task IDs

Its model is centered on **durable async jobs**, not interactive conversational sessions.

## What nanoboss is today

Nanoboss is currently built around an interactive agent-orchestration loop:

- a persistent `/default` downstream conversation session
- one-shot and nested `ctx.callAgent(...)` invocations
- live ACP stdio sessions to downstream agents
- streamed text/tool-call updates
- loopback HTTP MCP attachment so downstream agents can inspect nanoboss session state
- local durable session history stored as session cells on disk

Relevant repo files:

- `docs/architecture.md`
- `src/service.ts`
- `src/default-session.ts`
- `src/context.ts`
- `src/session-store.ts`

## Why Absurd is not a good fit for the core runtime

### 1. Nanoboss is conversational; Absurd is task-oriented

Absurd assumes a model like:

1. spawn a task
2. checkpoint work
3. maybe suspend
4. resume later
5. inspect/await by task ID

Nanoboss's main UX is instead:

1. maintain a live master conversation
2. stream text and tool telemetry in real time
3. preserve downstream provider session continuity
4. treat procedures as orchestrated work inside that interactive session

Those are related, but they are not the same runtime model.

### 2. Nanoboss depends on live downstream agent sessions

The `/default` path in nanoboss depends on a real live downstream ACP session with providers like Copilot, Claude, Codex, and Gemini.

That includes:

- provider-native session load/resume behavior
- real-time streaming output
- tool-call progress updates
- per-session MCP attachment

Absurd can durably checkpoint workflow state that nanoboss owns, but it does not naturally make a live downstream ACP subprocess/session behave like a resumable durable step.

### 3. It would add major infrastructure for the wrong layer

Nanoboss is currently local-first and file-backed.

Using Absurd would introduce:

- PostgreSQL as a required runtime dependency
- queue/schema lifecycle management
- worker processes
- operational complexity that does not directly solve the most important interactive-session problems

That is likely too heavy for the main path.

## Where Absurd *could* fit well

Absurd could make sense for future non-interactive or semi-interactive background workflows, for example:

- `/research --background`
- `/linter --background`
- long-running repo analysis that can survive restarts
- workflows that wait on external events, such as CI completion, webhook delivery, or human approval
- hosted/server deployment modes where durable multi-user background jobs matter

In those cases, Absurd's strengths line up much better with the problem:

- retries
- checkpointed progress
- durable waiting
- polling/awaiting a result by ID

## Best interpretation for nanoboss

Absurd is best viewed as a possible **optional subsystem for durable background procedure execution**, not as a replacement for:

- `DefaultConversationSession`
- the ACP orchestration path
- the live streaming CLI/server interaction model
- the session-cell durability model used for interactive state inspection

## Recommendation

### Do not use Absurd to redesign the main nanoboss runtime.

That would fight the grain of nanoboss's current architecture and likely make the interactive experience worse or much more complex.

### Keep it in the backlog for background-job use cases.

If nanoboss later needs durable background execution, revisit Absurd specifically for:

- detached procedure execution
- resumable long-running tasks
- event-driven waiting
- server/cloud deployment scenarios

## Suggested backlog follow-up

If this becomes important later, the next investigation should be a narrow spike answering:

1. Can nanoboss expose a procedure as a non-interactive job payload?
2. Which procedures are safe to run without a live persistent master conversation?
3. How would task IDs/results map back into nanoboss session cells and UI events?
4. Can background results be synchronized back into the default conversation cleanly after completion?
5. Is Postgres operationally justified for that use case?

## Bottom line

Absurd is **not applicable to nanoboss's core interactive architecture**, but it **is plausibly applicable to a future background durable-workflow layer**.
