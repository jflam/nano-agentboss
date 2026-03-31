# 2026-03-31 Deferred Plan: Explicit Streaming API for `callAgent()`

## Status

Deferred on purpose.

This should **not** be folded into the current `callAgent()` / `CommandContext` design until there is a clear need to expose partial model output as a first-class API.

The main reason to defer is to avoid increasing accidental complexity in the core execution model.

---

## Current state

Today the low-level ACP transport already receives incremental session updates from the downstream model.

At the transport layer, `runAcpPrompt(...)` can already observe:

- `agent_message_chunk`
- `tool_call`
- `tool_call_update`

via `CallAgentOptions.onUpdate`.

But the public `callAgent()` API is still fundamentally a **buffered** API:

- it waits for the downstream run to finish
- it accumulates final raw text
- typed calls parse and validate only at the end
- it returns a final `RunResult<T>` / `AgentRunResult<T>`

That is a good default because it keeps the common path simple.

---

## Problem statement

We may eventually want procedures like `/default` to surface downstream text incrementally instead of only after completion.

However, adding streaming to the current API raises design questions that cut across several areas:

- how partial text relates to final `display`
- how partial text relates to stored `stream`
- whether typed calls can stream before final JSON validation succeeds
- whether `callAgent()` should stay a single convenience API or split into buffered vs streaming forms
- how top-level procedure output should avoid duplicate emission when both chunks and final display exist

Those questions are real, but they are not urgent enough to justify complicating the current implementation.

---

## Design principle

Keep the simple thing simple:

- `callAgent()` should remain the default **buffered** convenience API
- streaming should be an explicit advanced feature
- do not force partial-output semantics into every caller

This is aligned with the broader goal of minimizing accidental complexity and reducing essential complexity where possible.

---

## Proposed future direction

When we decide to support streaming, prefer one of these explicit designs.

### Option A: add an explicit streaming callback to `callAgent()`

Example shape:

```ts
await ctx.callAgent(prompt, {
  onUpdate(update) {
    // observe ACP chunks / tool events
  },
});
```

Or a narrower version:

```ts
await ctx.callAgent(prompt, {
  onChunk(text) {
    ctx.print(text);
  },
});
```

### Option B: add a separate streaming API

Example shape:

```ts
await ctx.streamAgent(prompt, {
  onChunk(text) {
    ctx.print(text);
  },
});
```

This keeps `callAgent()` simple and makes the semantic split obvious:

- `callAgent()` = buffered final result
- `streamAgent()` = incremental output + final completion

### Current preference

Prefer **Option B** unless there is a strong reason to overload `callAgent()`.

A separate API is likely easier to reason about and less likely to produce edge cases around typed parsing and final result semantics.

---

## Non-goals for now

This deferred plan does **not** commit us to:

- streaming typed JSON before final validation
- changing `RunResult<T>`
- changing the cell/ref persistence model
- changing `/default` right now
- adding general event subscriptions throughout the command system

---

## Constraints for a future implementation

If we implement streaming later, preserve these constraints:

1. **One clear output model per call path**
   - avoid a design where the same text is emitted once as chunks and again as final display unless explicitly intended

2. **Typed calls validate only at the end**
   - incremental chunks are transport-level observations, not trusted typed results

3. **Buffered use remains ergonomic**
   - the default case should still be easy for command authors

4. **Persistence semantics stay clear**
   - distinguish between:
     - streamed progress text
     - final user-facing display
     - typed machine result

5. **No hidden coupling to top-level server behavior**
   - streaming behavior should not depend on accidental interactions between `ctx.print(...)`, downstream ACP updates, and final display emission

---

## Trigger to revisit

Revisit this plan only when at least one of these is true:

- users explicitly want `/default` or another procedure to show downstream text live
- a real command needs progressive UI feedback from the downstream agent
- buffered-only behavior is clearly hurting usability

Until then, keep the current buffered model.

---

## Success criteria for the future work

If implemented later, the streaming design is successful if:

1. command authors can opt into streaming without changing the simple buffered path
2. partial output and final output are not duplicated accidentally
3. typed calls still have a clear final validation boundary
4. the API surface is smaller and clearer than the alternatives it replaces
5. the implementation does not spread streaming-specific conditionals across unrelated code paths

---

## Recommendation

Do nothing now beyond preserving this note.

When streaming becomes necessary, design it as an **explicit opt-in API**, likely separate from `callAgent()`, and resist mixing transport-level chunk handling into the default buffered abstraction.