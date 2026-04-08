# 2026-04-08 callAgent session selection plan

## Summary

The old reused-session helper exposed an awkward special case in the procedure authoring API. The cleaner model is to make session reuse an explicit option on `ctx.callAgent(...)` so procedure authors can choose between:

- a **fresh ACP session** for isolated one-shot work
- the **default ACP session** for context-carrying work inside the caller's ongoing conversation

The refactor should preserve current behavior by default, keep structured-output support available in both modes, and collapse everything onto one `callAgent(...)` API.

---

## Goals

1. Replace the separate reused-session entrypoint with a unified `callAgent(...)` API.
2. Preserve existing semantics by making fresh sessions the default.
3. Support both untyped and typed agent calls regardless of session mode.
4. Make the API obvious enough that future agent-authored procedures use it correctly without rediscovering runtime details.

---

## Current state

### What exists today

- `ctx.callAgent(...)` can use either a fresh ACP session or the session-wide default ACP conversation.
- child procedures already inherit access to the same default conversation through `CommandContext`.
- `/default` is the visible example of reused-session behavior.

### What is awkward today

- procedure authors have to know that "reuse the current agent session" is a separate method instead of an option on the main one
- the split makes the API feel inconsistent
- the old split exposed the untyped reused-session path separately from the typed `callAgent(...)` path
- agent-authored procedures are more likely to choose the wrong primitive or ignore reuse entirely

---

## Proposed API shape

Add an explicit session-selection option to `CommandCallAgentOptions`:

```ts
type AgentSessionMode = "fresh" | "default";

ctx.callAgent(prompt, descriptor?, {
  session: "fresh" | "default",
  agent,
  refs,
  stream,
});
```

Design notes:

- default `session` to `"fresh"` so existing procedures keep their current behavior
- `"default"` means "reuse the current nanoboss session's default ACP conversation if available"
- keep the typed overloads working in both modes
- remove the separate reused-session helper so `callAgent(..., { session: "default" })` is the only public shape

I would prefer `session: "fresh" | "default"` over a bare boolean like `reuseSession: true` because it is easier to read and easier to extend later.

---

## Implementation approach

### 1. Unify the invocation path

Refactor `CommandContextImpl.callAgent(...)` so it chooses between two transports:

- **fresh transport**: current `invokeAgent(...)` path that opens a new ACP session
- **default transport**: a session-backed path that prompts `DefaultConversationSession`

The important design constraint is that prompt-building, named-ref injection, JSON schema prompting, parse/retry logic, and result normalization should stay shared. Session selection should change the transport, not fork the whole call stack.

### 2. Support typed calls in reused sessions

The unified API should support:

- `ctx.callAgent(prompt, { session: "default" })`
- `ctx.callAgent(prompt, ResultType, { session: "default" })`

That means the reused-session path should still run through the same JSON-schema prompt construction and parse/retry behavior that the fresh-session path uses today.

### 3. Migrate callers onto the unified API

Migration sequence:

1. add the new option and wire it through
2. switch `/default` to use `ctx.callAgent(prompt, { session: "default" })`
3. update any other internal call sites that should be explicit about reuse
4. remove the old helper from the public types and runtime implementation
5. stop teaching the old shape in docs and generated examples

---

## Documentation for future agent-authored procedures

This refactor needs documentation updates in the places future agents are most likely to read or imitate.

### Must-update surfaces

1. `src/core/types.ts`
   - update the `CommandCallAgentOptions` shape
   - document what `"fresh"` and `"default"` mean
   - make clear that `"fresh"` is the safe default for isolation

2. `src/procedure/create.ts`
   - update the procedure-generation prompt so generated procedures learn the new API
   - explicitly teach when to use `"fresh"` vs `"default"`
   - teach only `ctx.callAgent(..., { session: "default" })` for reused-session behavior

3. `docs/architecture.md`
   - explain that `callAgent(...)` now has two session modes over the same downstream ACP machinery
   - describe the difference between fresh one-shot calls and default-session reuse

4. `procedures/default.ts`
   - make it the canonical code example of reused-session behavior via `ctx.callAgent(..., { session: "default" })`

### Recommended guidance to include

Future agents should be taught these rules explicitly:

- use `session: "fresh"` for isolated structured tasks, validation sub-steps, and anything that should not inherit prior conversational context
- use `session: "default"` when the point is to continue the current conversational thread
- do not rely on reused-session context for deterministic side effects; keep host-side logic deterministic and narrow the agent's role to judgment or text generation
- when you need typed JSON output, prefer typed `callAgent(...)` even in `"default"` mode rather than inventing ad hoc parsing logic

This documentation work is part of the refactor, not follow-up polish. If we change the API without changing the procedure-authoring guidance, future agent-authored procedures will keep reproducing the old pattern.

---

## Risks and guardrails

- **Context bleed in reused sessions:** `"default"` mode can be influenced by prior conversation, so it should not silently become the default.
- **Typed-output regressions:** if reused-session calls bypass the existing parse/retry path, structured procedures will become less reliable.
- **Half-migrated authoring guidance:** generated procedures may continue to emit the old reused-session shape unless the scaffolding prompt is updated at the same time.

---

## Concrete follow-on enabled by this refactor

Once this lands, future procedures such as deterministic `/commit`, `/push`, and `/publish` can use:

- host-driven logic for git operations
- `ctx.callAgent(..., { session: "default" })` only where conversational continuity is actually useful, such as drafting a commit message from the current thread

That keeps the runtime model simple: deterministic side effects in code, optional conversational continuity through one unified agent-call API.
