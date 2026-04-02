# 2026-04-02 Top-level default session unification plan

## Problem statement

Today nanoboss has three different conversational layers that the user experiences as one:

1. the **nanoboss orchestration session**
2. the **persistent default downstream agent session**
3. **one-shot downstream sessions** created by slash-command internals like `/research` via `ctx.callAgent(...)`

This split is the root cause of the confusion we have been hitting:

- token counts appear inconsistent across turns
- slash commands do not feel like they happen "inside" the same conversation as plain prompts
- memory cards are doing delayed reconciliation work that should not be the primary continuity mechanism
- the user's mental model ("I am talking to one master agent") does not match runtime behavior

The core semantic issue is that the user-facing master/default agent session and the nanoboss orchestration session are not currently the same thing.

## Current behavior

### Plain prompts

A plain prompt like:

```text
what is 2+2
```

is resolved by `src/service.ts` to the built-in `default` procedure, which calls:

```ts
ctx.continueDefaultSession(prompt)
```

That uses `DefaultConversationSession`, which creates or resumes a **persistent downstream ACP session**.

### Slash commands

A slash command like:

```text
/research how to write fizzbuzz in python
```

is resolved by `src/service.ts` to the `research` procedure.

`commands/research.ts` then calls:

```ts
ctx.callAgent(buildResearchPrompt(...), ResearchResultType, { stream: false })
```

That goes through `src/call-agent.ts`, which opens a **fresh ACP connection**, creates a **new downstream session**, runs the prompt, and closes it.

So today `/research` is:

- in the same **nanoboss session store**
- but **not** in the same persistent downstream default-agent session

That is why memory cards and session MCP retrieval are needed later to stitch things back together.

## Correct semantic target

The user should be talking to **one persistent master/default agent session**.

That means:

- plain prompts go into it
- slash commands are exposed to it as tools
- slash-command results return into it immediately
- subsequent turns continue from that same accumulated context

In other words, slash commands should behave semantically like:

- MCP tool calls
- host tool calls
- or internal procedure tools

inside the same persistent master conversation.

## Important nuance

The goal is **not** necessarily:

> every slash command must run in the exact same downstream process

The real goal is:

> every slash command result must be observed by the same persistent master/default session as a tool result

That still leaves room for procedure implementations to spawn subagents internally when useful, as long as the tool result flows back into the persistent master session immediately.

## Proposed end state

1. **One persistent master/default downstream session** is the primary user-facing conversation.
2. **Slash procedures are exposed through MCP as tools** to that session.
3. **Procedure results return into the same default session** as tool results.
4. The nanoboss session store remains the durable system of record for:
   - exact results
n   - refs
   - summaries
   - memory
   - traversal
5. Memory cards remain useful for:
   - crash recovery
   - session reload
   - exact retrieval
   - delayed reconstruction

But memory cards stop being the primary continuity bridge between slash commands and plain prompts.

## Why this fixes the current problems

### Token accounting becomes interpretable

Today, token footers after `/research` reflect one-shot subagent sessions, not the master default session.

With the proposed model:

- plain prompts and slash-command results both belong to the persistent master/default session
- token counts can be discussed in terms of one main session instead of unrelated subagent contexts

### Continuity becomes real

Today, `/research` stores a result and later `/default` may get a summarized memory card about it.

With the proposed model:

- `/research` behaves like a tool call in the master session
- its result is immediately part of that session
- later turns do not depend on delayed lossy reconciliation

### Slash commands become first-class tools

This aligns slash commands with the same semantics as MCP or host tool calls.

## Exact MCP API shape

The transport remains standard MCP JSON-RPC.

### Initialize request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": {
      "name": "github-copilot-developer",
      "version": "1.0.0"
    }
  }
}
```

### Initialize result

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "nanoboss-session",
      "version": "<build-label>"
    },
    "instructions": "Use these tools to run nanoboss procedures and inspect durable session state for the current master session."
  }
}
```

### Tools list request

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

## Proposed tool categories

Expose two categories of tools to the persistent default session.

### A. Procedure tools

These are generated from the procedure registry and replace the semantic split.

#### `procedure_research`

```json
{
  "name": "procedure_research",
  "description": "Research a topic with a cited report and abstract",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": {
        "type": "string",
        "description": "Research question or topic"
      }
    },
    "required": ["prompt"],
    "additionalProperties": false
  }
}
```

#### `procedure_linter`

```json
{
  "name": "procedure_linter",
  "description": "Inspect and fix lint issues incrementally",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": {
        "type": "string",
        "description": "Lint goal or file scope"
      }
    },
    "required": ["prompt"],
    "additionalProperties": false
  }
}
```

#### `procedure_second_opinion`

```json
{
  "name": "procedure_second_opinion",
  "description": "Get a second-opinion critique of a task or answer",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": {
        "type": "string",
        "description": "Question or task to critique"
      }
    },
    "required": ["prompt"],
    "additionalProperties": false
  }
}
```

#### `procedure_tokens`

```json
{
  "name": "procedure_tokens",
  "description": "Show the latest token/context metrics for the default agent session",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
```

Additional user-facing procedures should follow the same pattern.

### B. Session/state inspection tools

These mostly already exist and should remain:

- `top_level_runs`
- `cell_descendants`
- `cell_ancestors`
- `cell_get`
- `ref_read`
- `session_recent`
- `ref_stat`
- `ref_write_to_file`
- `get_schema`

Representative schemas below.

#### `top_level_runs`

```json
{
  "name": "top_level_runs",
  "description": "Return top-level completed runs in reverse chronological order.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string" },
      "procedure": { "type": "string" },
      "limit": { "type": "number" }
    },
    "additionalProperties": false
  }
}
```

#### `cell_descendants`

```json
{
  "name": "cell_descendants",
  "description": "Return descendant cell summaries in depth-first pre-order.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "cellRef": {
        "type": "object",
        "properties": {
          "sessionId": { "type": "string" },
          "cellId": { "type": "string" }
        },
        "required": ["sessionId", "cellId"],
        "additionalProperties": false
      },
      "kind": {
        "type": "string",
        "enum": ["top_level", "procedure", "agent"]
      },
      "procedure": { "type": "string" },
      "maxDepth": { "type": "number" },
      "limit": { "type": "number" }
    },
    "required": ["cellRef"],
    "additionalProperties": false
  }
}
```

#### `cell_ancestors`

```json
{
  "name": "cell_ancestors",
  "description": "Return ancestor cell summaries nearest-first.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "cellRef": {
        "type": "object",
        "properties": {
          "sessionId": { "type": "string" },
          "cellId": { "type": "string" }
        },
        "required": ["sessionId", "cellId"],
        "additionalProperties": false
      },
      "includeSelf": { "type": "boolean" },
      "limit": { "type": "number" }
    },
    "required": ["cellRef"],
    "additionalProperties": false
  }
}
```

#### `cell_get`

```json
{
  "name": "cell_get",
  "description": "Return one exact stored cell record.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "cellRef": {
        "type": "object",
        "properties": {
          "sessionId": { "type": "string" },
          "cellId": { "type": "string" }
        },
        "required": ["sessionId", "cellId"],
        "additionalProperties": false
      }
    },
    "required": ["cellRef"],
    "additionalProperties": false
  }
}
```

#### `ref_read`

```json
{
  "name": "ref_read",
  "description": "Read the exact value at a durable session ref.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "valueRef": {
        "type": "object",
        "properties": {
          "cell": {
            "type": "object",
            "properties": {
              "sessionId": { "type": "string" },
              "cellId": { "type": "string" }
            },
            "required": ["sessionId", "cellId"],
            "additionalProperties": false
          },
          "path": { "type": "string" }
        },
        "required": ["cell", "path"],
        "additionalProperties": false
      }
    },
    "required": ["valueRef"],
    "additionalProperties": false
  }
}
```

## Proposed procedure-tool result shape

A procedure tool call should return both readable text and structured references.

Example `tools/call` result for `procedure_research`:

```json
{
  "content": [
    {
      "type": "text",
      "text": "FizzBuzz in Python is typically written with a for loop over range(1, 101) ..."
    }
  ],
  "structuredContent": {
    "procedure": "research",
    "cell": {
      "sessionId": "9b8d4964-8313-45ee-b16a-0b310dee637c",
      "cellId": "40d53992-8c74-49bf-9d1e-45ca1ae75f05"
    },
    "summary": "research: how to write fizzbuzz in python",
    "display": "FizzBuzz in Python is typically written with a for loop over range(1, 101) ...",
    "memory": "Research completed for how to write fizzbuzz in python. The detailed cited report is stored in the procedure result data.",
    "dataRef": {
      "cell": {
        "sessionId": "9b8d4964-8313-45ee-b16a-0b310dee637c",
        "cellId": "40d53992-8c74-49bf-9d1e-45ca1ae75f05"
      },
      "path": "output.data"
    },
    "displayRef": {
      "cell": {
        "sessionId": "9b8d4964-8313-45ee-b16a-0b310dee637c",
        "cellId": "40d53992-8c74-49bf-9d1e-45ca1ae75f05"
      },
      "path": "output.display"
    },
    "dataShape": {
      "report": "string",
      "abstract": "string"
    },
    "tokenUsage": {
      "provider": "copilot",
      "sessionId": "nested-procedure-agent-session-id",
      "source": "copilot_log",
      "currentContextTokens": 36507,
      "maxContextTokens": 272000
    }
  }
}
```

This lets the persistent master session observe:

- a short readable result
- durable refs for exact retrieval
- compact continuity metadata
- optional token diagnostics

## Recommended implementation path

### Phase 1: establish one semantic master session

- keep `DefaultConversationSession` as the single persistent downstream master session
- treat it as the primary conversation the user is actually talking to

### Phase 2: expose procedures as MCP tools

- generate MCP tools from the procedure registry for user-facing procedures
- attach that MCP surface to the persistent default session
- make slash-command semantics tool-like from the master session perspective

### Phase 3: route slash commands into the master session as tool operations

Instead of executing `/research` purely as a host-side side channel, nanoboss should make the persistent default session experience it as a tool invocation.

The persistent session can still rely on host orchestration, but the result must come back into the same ongoing session immediately.

### Phase 4: keep subagent spawning as an implementation detail

Procedure tools may still internally spawn one-shot subagents when necessary.

That is acceptable as long as:

- the master session sees the procedure result as a tool result
- the master session remains the single semantic conversation

### Phase 5: demote memory cards from primary continuity to resilience/recovery

Keep memory cards and session refs for:

- crash recovery
- session reload
- exact structured retrieval
- historical traversal

But stop using them as the main semantic glue between slash commands and default chat.

## Key architectural distinction

We do **not** need every slash command to run inside the exact same downstream process.

We **do** need every slash command result to flow back into the same persistent master/default session as a tool result.

That is the architectural correction.

## Summary

The right target is:

- one persistent master/default session
- slash procedures exposed through MCP as tools
- immediate result flow back into that same session
- session store and refs remain the durable source of truth
- memory cards become secondary resilience infrastructure instead of the main continuity bridge
