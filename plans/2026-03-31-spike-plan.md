# nanoboss Spike Plan

## Vision

**Inversion of control for agentic coding**: deterministic TypeScript programs
(procedures) control the outer loop, calling stateless agents for atomic subtasks
via ACP. Procedures compose via `callProcedure()`. Users can create new procedures
dynamically using `/create`, making the system self-extending (like LISP's
`defmacro`).

## Architecture

```
                          ACP (stdio)                    ACP (stdio)
┌─────────────┐    JSON-RPC / newline     ┌───────────────────┐    JSON-RPC / newline     ┌─────────────────┐
│  CLI Client  │◄────────────────────────►│  nanoboss   │◄────────────────────────►│  copilot / any  │
│  (thin REPL) │                          │  (Bun, ACP agent) │                          │  ACP agent      │
└─────────────┘                          │                   │                          └─────────────────┘
                                          │  Procedure Registry│
                                          │  ┌──────────────┐ │
                                          │  │ default      │ │  ← no slash, just pass-through
                                          │  │ /commit      │ │
                                          │  │ /linter      │ │  ← composes /commit via callProcedure
                                          │  │ /create      │ │
                                          │  │ (user-made)  │ │
                                          │  └──────────────┘ │
                                          │                   │
                                          │  callAgent<T>()   │
                                          │  callProcedure()   │
                                          │  (ACP client)     │
                                          └───────────────────┘
```

**nanoboss is both an ACP agent (upstream, talked to by CLI) and an ACP
client (downstream, talks to copilot/claude/etc).**

The two primitives available to procedures:
- **`callAgent()`** — spawns a fresh ACP session to a downstream agent. Stateless.
  No descriptor → returns raw string. With descriptor → typed, schema-injected, validated.
- **`callProcedure()`** — calls another registered procedure by name. Enables composition.
  `/linter` can call `/commit` after each fix without knowing how commits work.

Local variables in the procedure function carry state between calls.

## Logging

Every procedure execution and every `callAgent()` / `callProcedure()` call is
logged with hierarchical scoping.

### Log structure

```
~/.nanoboss/logs/
  {runId}.jsonl                    # one JSONL file per top-level procedure run
```

Each line in the JSONL file is a log entry:

```typescript
interface LogEntry {
  timestamp: string;               // ISO 8601
  runId: string;                   // top-level procedure run ID
  spanId: string;                  // unique ID for this call
  parentSpanId?: string;           // parent's spanId (for nesting)
  procedure: string;               // which procedure is executing
  kind: "procedure_start" | "procedure_end" | "agent_start" | "agent_end" | "print";
  prompt?: string;                 // the prompt sent (for agent calls)
  result?: unknown;                // parsed return value
  raw?: string;                    // raw agent response text
  durationMs?: number;
  error?: string;
  agentLogFile?: string;           // downstream agent's log file path
}
```

### Example log for `/linter` run

```
{runId: "r1", spanId: "s1", kind: "procedure_start", procedure: "linter"}
{runId: "r1", spanId: "s2", parentSpanId: "s1", kind: "agent_start", procedure: "linter", prompt: "Run the linter..."}
{runId: "r1", spanId: "s2", parentSpanId: "s1", kind: "agent_end", procedure: "linter", durationMs: 4200, agentLogFile: "..."}
{runId: "r1", spanId: "s3", parentSpanId: "s1", kind: "agent_start", procedure: "linter", prompt: "Fix error..."}
{runId: "r1", spanId: "s3", parentSpanId: "s1", kind: "agent_end", procedure: "linter", durationMs: 8100}
{runId: "r1", spanId: "s4", parentSpanId: "s1", kind: "procedure_start", procedure: "commit"}   ← callProcedure
{runId: "r1", spanId: "s5", parentSpanId: "s4", kind: "agent_start", procedure: "commit", prompt: "Git commit..."}
{runId: "r1", spanId: "s5", parentSpanId: "s4", kind: "agent_end", procedure: "commit", durationMs: 3000}
{runId: "r1", spanId: "s4", parentSpanId: "s1", kind: "procedure_end", procedure: "commit", durationMs: 3200}
{runId: "r1", spanId: "s1", kind: "procedure_end", procedure: "linter", durationMs: 52000}
```

### Querying logs

Because it's JSONL, querying is trivial:
- "All logs from last `/linter` run" → read the most recent file where procedure="linter"
- "All logs from `/commit` within that run" → filter by procedure="commit" within that file
- "All agent calls" → filter by kind="agent_start" or "agent_end"
- The `parentSpanId` chain gives you the full call tree

### Implementation

Logging is **implicit** — procedure authors don't write any logging code. The
`CommandContext` implementation wraps `callAgent()` and `callProcedure()` to
emit log entries automatically. `ctx.print()` also logs with kind="print".

```typescript
// Inside CommandContext implementation — procedure authors never see this
class CommandContextImpl implements CommandContext {
  private logger: RunLogger;
  private spanId: string;

  async callAgent<T = string>(prompt: string, descriptor?: TypeDescriptor<T>): Promise<AgentResult<T>> {
    const childSpan = this.logger.newSpan(this.spanId);
    this.logger.write({ kind: "agent_start", spanId: childSpan, parentSpanId: this.spanId, prompt, ... });

    const result = await rawCallAgent(prompt, descriptor);

    this.logger.write({ kind: "agent_end", spanId: childSpan, parentSpanId: this.spanId, durationMs: ..., agentLogFile: result.logFile, ... });
    return result;
  }

  async callProcedure(name: string, prompt: string): Promise<string | void> {
    const childSpan = this.logger.newSpan(this.spanId);
    this.logger.write({ kind: "procedure_start", spanId: childSpan, parentSpanId: this.spanId, procedure: name, ... });

    // Create a child context with the child span
    const childCtx = new CommandContextImpl(this.logger, childSpan, this.cwd);
    const procedure = registry.get(name);
    const result = await procedure.execute(prompt, childCtx);

    this.logger.write({ kind: "procedure_end", spanId: childSpan, parentSpanId: this.spanId, procedure: name, durationMs: ..., ... });
    return result;
  }
}
```

## Dependencies

| Package | Purpose |
|---|---|
| `@agentclientprotocol/sdk` | ACP agent-side (serve CLI) + client-side (call downstream agents) |
| `typia` | Compile-time TypeScript → JSON Schema + runtime validation |
| `@ryoppippi/unplugin-typia` | Bun plugin for typia's compile-time transforms |

## Project Structure

```
nanoboss/
├── package.json
├── tsconfig.json
├── bun.toml                    # typia preload plugin config
├── src/
│   ├── server.ts               # ACP agent-side: handles CLI connections
│   ├── call-agent.ts           # ACP client-side: spawns downstream agent sessions
│   ├── registry.ts             # Procedure registry: loads, stores, advertises procedures
│   ├── context.ts              # CommandContext implementation (logging, callAgent, callProcedure)
│   ├── logger.ts               # RunLogger: JSONL log writer with span tracking
│   ├── create.ts               # /create meta-command implementation
│   └── types.ts                # Shared TypeScript types for procedure return values
├── commands/
│   ├── default.ts              # Pass-through to downstream agent (also the default procedure)
│   ├── commit.ts               # Git commit procedure (composable)
│   └── linter.ts               # Proof-of-concept deterministic linter loop (composes /commit)
└── cli.ts                      # Thin ACP client REPL
```

## Phase 1: Project Scaffolding & callAgent Primitive

### 1.1 Initialize project

- `bun init`
- Install dependencies: `@agentclientprotocol/sdk`, `typia`, `@ryoppippi/unplugin-typia`
- Configure `tsconfig.json` with strict mode, typia plugin
- Configure `bun.toml` with typia preload for compile-time transforms

### 1.2 Implement `callAgent<T>()` — the core primitive

**File: `src/call-agent.ts`**

This is the heart of the system. It's an ACP client that talks to a downstream agent.

```typescript
import * as acp from "@agentclientprotocol/sdk";

// Agent configuration — which downstream agent to spawn
interface DownstreamAgentConfig {
  command: string;        // e.g., "copilot"
  args: string[];         // e.g., ["--acp", "--allow-all-tools"]
  cwd?: string;
}

// Type descriptor — created at compile time by typia
interface TypeDescriptor<T> {
  schema: object;                    // JSON Schema from typia.json.schema<T>()
  validate: (input: unknown) => boolean;  // from typia.createIs<T>()
}

// Result of every agent call
interface AgentResult<T> {
  value: T;              // Parsed, validated return value
  logFile?: string;      // Path to the agent's log/session file
  durationMs: number;    // Wall clock time
  raw: string;           // Raw text response from agent
}

const MAX_PARSE_RETRIES = 2;

// Default T = string: no descriptor needed, returns raw text
// With T + descriptor: appends schema to prompt, parses JSON, validates
async function callAgent<T = string>(
  prompt: string,
  descriptor?: TypeDescriptor<T>,
  config?: DownstreamAgentConfig
): Promise<AgentResult<T>> {
  const startTime = Date.now();

  // 1. Build the prompt — only append schema if a descriptor was provided
  const fullPrompt = descriptor
    ? `${prompt}\n\nRespond ONLY with valid JSON matching this schema (no markdown, no code fences):\n${JSON.stringify(descriptor.schema, null, 2)}`
    : prompt;

  // 2. Spawn downstream agent via ACP (using @agentclientprotocol/sdk)
  //    - spawn subprocess
  //    - initialize handshake
  //    - create session
  //    - send prompt
  //    - collect response text from session/update agent_message_chunk events
  //      (stream chunks to CLI in real-time via ctx.print)
  //    - close session / kill process

  let raw = ""; // collected from agent_message_chunk events

  // 3. If no descriptor, return raw text as-is (T defaults to string)
  if (!descriptor) {
    return {
      value: raw as T,
      logFile: undefined, // TODO: extract from agent
      durationMs: Date.now() - startTime,
      raw,
    };
  }

  // 4. Typed mode: parse and validate with retries
  let lastError = "";
  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    try {
      const parsed = JSON.parse(raw);
      if (descriptor.validate(parsed)) {
        return {
          value: parsed as T,
          logFile: undefined,
          durationMs: Date.now() - startTime,
          raw,
        };
      }
      lastError = "JSON parsed but failed schema validation";
    } catch (e) {
      lastError = `JSON parse error: ${e}`;
    }

    if (attempt < MAX_PARSE_RETRIES) {
      // Retry with error feedback in a NEW session
      raw = "";
      // Send: "Your previous response was invalid: {lastError}. Please try again..."
    }
  }

  throw new Error(`callAgent failed after ${MAX_PARSE_RETRIES + 1} attempts: ${lastError}`);
}
```

**Key decisions:**
- Each `callAgent()` creates a fresh ACP connection (spawn → initialize → session/new → prompt → collect → kill)
- Schema is appended to the prompt as a JSON Schema block
- On parse/validation failure, retries with error feedback in a new session
- Returns structured `AgentResult<T>` with metadata

### 1.3 Log file extraction

Study how AgentBoss extracts log files in `crates/agentboss-executor/src/logging.rs`. The pattern:
- Copilot: logs are likely in `~/.copilot/logs/` or similar
- Claude: logs in `~/.claude/projects/` session files
- For the spike: capture the full agent_message_chunk stream and stderr as our "log"
- The `agentLogFile` field in `LogEntry` captures the downstream agent's log path

## Phase 2: ACP Agent Server

### 2.1 Implement the ACP server

**File: `src/server.ts`**

nanoboss itself is an ACP agent. The CLI talks to it over stdio.

Using `@agentclientprotocol/sdk`'s `AgentSideConnection`:

```typescript
import * as acp from "@agentclientprotocol/sdk";

// Implement the Agent interface from the SDK
class Nanoboss implements acp.Agent {
  // Handle initialize — advertise our capabilities
  async initialize(params) {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agent: { name: "nanoboss", version: "0.1.0" },
      agentCapabilities: { /* ... */ },
    };
  }

  // Handle session/new
  async newSession(params) {
    const sessionId = crypto.randomUUID();
    // After session creation, send available_commands_update
    // with all registered procedures
    return { sessionId };
  }

  // Handle session/prompt — this is where procedures get dispatched
  async prompt(params, abortSignal) {
    const text = extractText(params.prompt);

    // Create a run logger for this prompt
    const runId = crypto.randomUUID();
    const logger = new RunLogger(runId);

    if (text.startsWith("/")) {
      const [commandName, ...rest] = text.slice(1).split(/\s+/);
      const procedure = registry.get(commandName);
      if (procedure) {
        const ctx = new CommandContextImpl(logger, logger.rootSpan(), params.cwd);
        logger.write({ kind: "procedure_start", procedure: commandName, ... });
        await procedure.execute(rest.join(" "), ctx);
        logger.write({ kind: "procedure_end", procedure: commandName, ... });
      } else {
        // Forward to print
        print(`Unknown command: /${commandName}`);
      }
    } else {
      // No slash command — use the default pass-through
      const ctx = new CommandContextImpl(logger, logger.rootSpan(), params.cwd);
      logger.write({ kind: "procedure_start", procedure: "default", ... });
      await registry.get("default")!.execute(text, ctx);
      logger.write({ kind: "procedure_end", procedure: "default", ... });
    }

    logger.close();
    return { stopReason: "end_turn" };
  }
}
```

### 2.2 Session update forwarding

When a procedure's `callAgent()` calls are running, we need to forward progress to the CLI:
- Forward `agent_message_chunk` events from the downstream agent
- Send `tool_call` / `tool_call_update` events for each `callAgent()` invocation

This gives the CLI real-time visibility into what the deterministic loop is doing.

## Phase 3: Procedure System

### 3.1 Procedure interface

**File: `src/registry.ts`**

```typescript
// Every procedure implements this interface
interface Procedure {
  name: string;
  description: string;
  inputHint?: string;  // ACP AvailableCommandInput hint

  // The deterministic program
  // Returns raw text (pass-through) or void (structured procedures send via ctx)
  execute(
    prompt: string,                          // user's input after the /command
    ctx: CommandContext                       // utilities for calling agents/procedures
  ): Promise<string | void>;
}

interface CommandContext {
  // No descriptor → T=string, raw pass-through
  // With descriptor → typed, schema-injected, validated
  callAgent<T = string>(prompt: string, descriptor?: TypeDescriptor<T>): Promise<AgentResult<T>>;

  // Call another procedure by name — enables composition
  callProcedure(name: string, prompt: string): Promise<string | void>;

  // Write text back to CLI
  print(text: string): void;

  // Working directory
  cwd: string;
}

class ProcedureRegistry {
  private procedures: Map<string, Procedure> = new Map();

  // Load built-in procedures
  loadBuiltins(): void { /* /create */ }

  // Load procedures from commands/ directory
  async loadFromDisk(): Promise<void> {
    // Scan commands/*.ts, dynamically import each
    // Each file exports a Procedure
  }

  // Register a new procedure (used by /create)
  register(procedure: Procedure): void { ... }

  // Save a procedure to disk (used by /create)
  async persist(procedure: Procedure, source: string): void {
    // Write to commands/{name}.ts
  }

  // Generate ACP AvailableCommand[] for advertising
  toAvailableCommands(): acp.AvailableCommand[] { ... }
}
```

### 3.2 Default pass-through procedure

**File: `commands/default.ts`**

The simplest possible procedure — sends the prompt to the downstream agent and
streams the response back. No typed returns, no schema, just a raw pass-through.
This serves two purposes:

1. **Proves the full ACP roundtrip** (CLI → server → downstream agent → response → CLI)
2. **Becomes the default procedure** — when the user types something without a `/` prefix,
   the server dispatches to this

```typescript
export default {
  name: "default",
  description: "Pass prompt through to the downstream agent",

  async execute(prompt: string, ctx: CommandContext) {
    // No type descriptor → T defaults to string → raw pass-through
    // Streams agent_message_chunk events to CLI in real-time
    const result = await ctx.callAgent(prompt);
    return result.value;
  },
} satisfies Procedure;
```

### 3.3 Example procedure: `/commit`

**File: `commands/commit.ts`**

A composable procedure for git commits. Used standalone or called by other
procedures like `/linter`.

```typescript
export default {
  name: "commit",
  description: "Git commit staged or recent changes with a descriptive message",

  async execute(prompt: string, ctx: CommandContext) {
    await ctx.callAgent(
      `Git commit the changes with a descriptive message. Context: ${prompt}`
    );
  },
} satisfies Procedure;
```

### 3.4 Example procedure: `/linter`

**File: `commands/linter.ts`**

The proof-of-concept for the inversion of control pattern. Composes `/commit`
via `callProcedure()`.

```typescript
import typia from "typia";

interface LinterError {
  file: string;
  line: number;
  column: number;
  message: string;
  rule: string;
}

interface FixResult {
  fixed: boolean;
  description: string;
}

const LinterErrors = {
  schema: typia.json.schema<LinterError[]>(),
  validate: typia.createIs<LinterError[]>(),
};

const FixResultType = {
  schema: typia.json.schema<FixResult>(),
  validate: typia.createIs<FixResult>(),
};

const MAX_RETRIES = 3;
const MAX_FIX_RETRIES = 2;

export default {
  name: "linter",
  description: "Fix all linter errors in the project",
  inputHint: "Optional focus area or instructions",

  async execute(prompt: string, ctx: CommandContext) {
    let retries = 0;
    let totalFixed = 0;
    let totalFailed = 0;

    // Get initial list of errors
    let errors = (await ctx.callAgent<LinterError[]>(
      `Run the linter in ${ctx.cwd} and return all errors as a list. ${prompt}`,
      LinterErrors,
    )).value;

    while (errors.length > 0 && retries < MAX_RETRIES) {
      ctx.print(`Round ${retries + 1}: ${errors.length} errors to fix`);

      for (const error of errors) {
        let fixRetries = 0;
        let fixed = false;

        do {
          const result = await ctx.callAgent<FixResult>(
            `Fix this linter error: ${error.file}:${error.line}:${error.column} — ${error.message} (rule: ${error.rule}).
             After fixing, run the build and tests to make sure nothing is broken.
             Return whether the fix was successful.`,
            FixResultType,
          );
          fixed = result.value.fixed;
          fixRetries++;
        } while (!fixed && fixRetries < MAX_FIX_RETRIES);

        if (fixed) {
          totalFixed++;
          // Compose /commit — don't duplicate commit logic here
          await ctx.callProcedure("commit", `linter fix for ${error.file}:${error.line} — ${error.message}`);
        } else {
          totalFailed++;
        }
      }

      // Re-check: are there remaining errors?
      errors = (await ctx.callAgent<LinterError[]>(
        `Run the linter again in ${ctx.cwd} and return all remaining errors. ${prompt}`,
        LinterErrors,
      )).value;

      retries++;
    }

    ctx.print(
      `Done. Fixed ${totalFixed} errors, ${totalFailed} failed, ${errors.length} remaining.`
    );
  },
} satisfies Procedure;
```

### 3.5 The `/create` meta-procedure

**File: `src/create.ts`**

This is the `defmacro` — it uses the downstream agent to generate a new procedure.

```typescript
export default {
  name: "create",
  description: "Create a new procedure from natural language",
  inputHint: "Describe the procedure you want to create",

  async execute(prompt: string, ctx: CommandContext) {
    // 1. Ask the agent to generate a procedure
    const generated = await ctx.callAgent<{ name: string; source: string }>(
      `You are generating a nanoboss procedure.

       A procedure is a TypeScript file that exports a default object with:
       - name: string
       - description: string
       - execute(prompt: string, ctx: CommandContext): Promise<string | void>

       CommandContext provides:
       - ctx.callAgent(prompt) — call downstream AI agent, returns raw string
       - ctx.callAgent<T>(prompt, descriptor) — typed call with schema validation
       - ctx.callProcedure(name, prompt) — call another procedure by name
       - ctx.print(text) — write text back to CLI
       - ctx.cwd — working directory

       Here are example procedures for reference:
       [inject commit.ts and linter.ts source here]

       User's request: ${prompt}

       Generate the procedure. Return the procedure name and full TypeScript source.`,
      GeneratedProcedureType,
    );

    // 2. Write to disk
    const filePath = `commands/${generated.value.name}.ts`;
    // Write generated.value.source to filePath

    // 3. Register in the procedure registry
    // Dynamically import the new file and register it

    // 4. Advertise via ACP available_commands_update

    ctx.print(`Created procedure /${generated.value.name} at ${filePath}`);
  },
} satisfies Procedure;
```

## Phase 4: Testing

### 4.1 Project structure for tests

```
tests/
├── unit/
│   ├── logger.test.ts           # RunLogger JSONL output, span nesting
│   ├── registry.test.ts         # Procedure loading, registration, lookup
│   └── call-agent-parse.test.ts # JSON parsing, schema validation, retry logic
└── e2e/
    ├── passthrough.test.ts      # callAgent() with no descriptor, real agent
    ├── typed.test.ts            # callAgent<T>() with descriptor, real agent
    └── composition.test.ts      # callProcedure() nesting, real agent
```

### 4.2 Unit tests (no real agent, fast)

These mock the ACP transport layer and test the logic around `callAgent()`.

**`tests/unit/call-agent-parse.test.ts`**

```typescript
import { describe, test, expect } from "bun:test";

describe("callAgent response parsing", () => {
  test("returns raw string when no descriptor provided", ...);
  test("parses valid JSON matching schema", ...);
  test("rejects JSON that fails schema validation", ...);
  test("retries on invalid JSON with error feedback", ...);
  test("throws after MAX_PARSE_RETRIES exhausted", ...);
  test("strips markdown code fences from response before parsing", ...);
});
```

**`tests/unit/logger.test.ts`**

```typescript
describe("RunLogger", () => {
  test("writes JSONL to correct file path", ...);
  test("assigns unique spanIds", ...);
  test("parentSpanId links child to parent", ...);
  test("procedure_start/end pairs are balanced", ...);
  test("agent_start/end pairs capture duration", ...);
});
```

**`tests/unit/registry.test.ts`**

```typescript
describe("ProcedureRegistry", () => {
  test("loads procedures from commands/ directory", ...);
  test("get() returns undefined for unknown procedure", ...);
  test("register() makes procedure available via get()", ...);
  test("toAvailableCommands() returns ACP-formatted list", ...);
});
```

### 4.3 E2E tests (real agent, pure functions)

These call a real downstream agent via ACP. They use pure, side-effect-free
prompts (math, string manipulation, data extraction) so they're safe to run
anywhere and deterministic in their expected shape (if not exact values).

**`tests/e2e/passthrough.test.ts`** — untyped `callAgent()`

```typescript
import { describe, test, expect } from "bun:test";

describe("callAgent passthrough (real agent)", () => {
  test("returns a non-empty string response", async () => {
    const result = await callAgent("What is 2 + 2? Reply with just the number.");
    expect(result.value.trim()).toBe("4");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.raw).toBeTruthy();
  });

  test("handles multi-line response", async () => {
    const result = await callAgent("List the first 3 prime numbers, one per line, just the numbers.");
    const lines = result.value.trim().split("\n").map(l => l.trim());
    expect(lines).toEqual(["2", "3", "5"]);
  });
});
```

**`tests/e2e/typed.test.ts`** — typed `callAgent<T>()`

```typescript
import { describe, test, expect } from "bun:test";
import typia from "typia";

interface MathResult {
  expression: string;
  result: number;
}

const MathResultType = {
  schema: typia.json.schema<MathResult>(),
  validate: typia.createIs<MathResult>(),
};

interface WordAnalysis {
  word: string;
  length: number;
  vowels: number;
  reversed: string;
}

const WordAnalysisType = {
  schema: typia.json.schema<WordAnalysis>(),
  validate: typia.createIs<WordAnalysis>(),
};

describe("callAgent typed (real agent)", () => {
  test("returns typed math result", async () => {
    const result = await callAgent<MathResult>(
      "Compute 17 * 23",
      MathResultType,
    );
    expect(result.value.result).toBe(391);
    expect(result.value.expression).toContain("17");
  });

  test("returns typed word analysis", async () => {
    const result = await callAgent<WordAnalysis>(
      "Analyze the word 'hello'",
      WordAnalysisType,
    );
    expect(result.value.word).toBe("hello");
    expect(result.value.length).toBe(5);
    expect(result.value.vowels).toBe(2);
    expect(result.value.reversed).toBe("olleh");
  });

  test("validates schema and rejects bad shape", async () => {
    // Use a descriptor that expects a shape the agent won't produce
    const StrictType = {
      schema: typia.json.schema<{ uuid: string; timestamp: number }>(),
      validate: typia.createIs<{ uuid: string; timestamp: number }>(),
    };
    // Ask for something that doesn't match — should retry then throw
    await expect(
      callAgent("Say hello", StrictType)
    ).rejects.toThrow();
  });
});
```

**`tests/e2e/composition.test.ts`** — `callProcedure()` nesting

```typescript
import { describe, test, expect } from "bun:test";

// Register two test procedures:
// /double — asks agent to double a number
// /quadruple — calls /double twice via callProcedure

describe("callProcedure composition (real agent)", () => {
  test("quadruple composes double", async () => {
    // Register /double
    registry.register({
      name: "double",
      description: "Double a number",
      async execute(prompt, ctx) {
        const result = await ctx.callAgent<MathResult>(
          `Double this number: ${prompt}`,
          MathResultType,
        );
        return String(result.value.result);
      },
    });

    // Register /quadruple that composes /double
    registry.register({
      name: "quadruple",
      description: "Quadruple a number",
      async execute(prompt, ctx) {
        const doubled = await ctx.callProcedure("double", prompt);
        const quadrupled = await ctx.callProcedure("double", doubled!);
        return quadrupled;
      },
    });

    const ctx = createTestContext();
    const result = await registry.get("quadruple")!.execute("5", ctx);
    expect(Number(result)).toBe(20);
  });

  test("nested callProcedure logs have correct parentSpanId chain", async () => {
    // Run /quadruple and inspect the JSONL log
    // Verify: quadruple.spanId → double.parentSpanId → agent.parentSpanId
  });
});
```

### 4.4 Test configuration

- Unit tests: `bun test tests/unit/` — fast, no network, run in CI
- E2E tests: `bun test tests/e2e/` — requires a real ACP agent (copilot), slower
- E2E tests should have a longer timeout (60s+ per test) since agent calls are slow
- E2E tests should be skippable via env var (e.g., `SKIP_E2E=1`) for CI without agent access

## Phase 5: CLI Client

### 5.1 Thin ACP client REPL

**File: `cli.ts`**

Dead simple — spawns nanoboss as a subprocess, sends prompts, renders updates.

```typescript
import * as acp from "@agentclientprotocol/sdk";
import readline from "readline";

// 1. Spawn nanoboss as subprocess
// 2. ACP initialize + session/new
// 3. REPL loop:
//    - Read user input
//    - Send session/prompt
//    - Render session/update events (text chunks, tool calls)
//    - Handle permission requests (auto-approve for spike)
// 4. Tab completion from available_commands_update
```

Rendering:
- `agent_message_chunk` → print text to stdout
- `tool_call` → show "[calling agent: {title}]"
- `available_commands_update` → update tab completion list

## Phase 6: Refinements (post-spike)

- **Batching**: Instead of one `callAgent()` per linter error, batch multiple errors into a single call
- **Parallelism**: Run independent `callAgent()` calls concurrently with `Promise.all()`
- **Agent selection**: Per-command or per-call choice of downstream agent
- **Session reuse**: Option to reuse a downstream agent session across calls within a procedure (for context-heavy workflows)
- **Log viewer**: CLI command to browse collected procedure logs (e.g., `/logs linter`)
- **Custom TypeScript transform**: Eliminate the type descriptor parameter, make `callAgent<T>(prompt)` just work

## Build Order

For the spike, build in this order:

1. **Scaffold** — `bun init`, deps, tsconfig, bun.toml with typia plugin
2. **Logger** — JSONL run logger with span tracking + unit tests
3. **`callAgent()`** — get it spawning copilot via ACP, both typed and pass-through modes
4. **Unit tests for callAgent** — mock ACP transport, test parsing/validation/retry logic
5. **E2E tests for callAgent** — pure function tests (math, string analysis) against real agent
6. **`default` procedure** — pass-through to downstream agent, proves the full ACP roundtrip
7. **Server** — ACP agent-side so the CLI can talk to us
8. **CLI** — thin REPL that talks ACP to the server
9. **Registry + `callProcedure()`** — load procedures from disk, advertise via ACP, enable composition
10. **E2E tests for callProcedure** — composition tests (double/quadruple) against real agent
11. **`/commit`** — simple composable procedure
12. **`/linter`** — prove the deterministic loop + composition pattern works
13. **`/create`** — prove self-extension works

Steps 2-5 can be tested without the CLI by running callAgent directly.
The CLI + server layer (7-8) enables the full ACP loop. Steps 9-13 are the payoff.
