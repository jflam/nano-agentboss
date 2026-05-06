import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { SessionStore, writeStoredSessionMetadata } from "@nanoboss/store";

const tempDirs: string[] = [];
const MCP_SERVER_BOOTSTRAP = [
  'import { MCP_INSTRUCTIONS, MCP_SERVER_NAME, runMcpServer } from "@nanoboss/adapters-mcp";',
  'import { createCurrentSessionBackedNanobossRuntimeService } from "@nanoboss/app-runtime";',
  "const runtime = createCurrentSessionBackedNanobossRuntimeService(process.env.NANOBOSS_MCP_TEST_CWD ?? process.cwd());",
  "await runMcpServer(runtime, { serverName: MCP_SERVER_NAME, instructions: MCP_INSTRUCTIONS });",
].join("\n");

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

describe("global nanoboss MCP stdio transport", () => {
  test("serves tools/list and defaults to the current session for the server cwd", async () => {
    const home = mkdtempSync(join(tmpdir(), "nanoboss-mcp-home-"));
    const rootDir = mkdtempSync(join(tmpdir(), "nanoboss-mcp-root-"));
    tempDirs.push(home, rootDir);

    const originalHome = process.env.HOME;
    process.env.HOME = home;

    const sessionId = `session-mcp-${crypto.randomUUID()}`;
    const store = new SessionStore({
      sessionId,
      cwd: process.cwd(),
      rootDir,
    });
    const reviewCell = store.startRun({
      procedure: "second-opinion",
      input: "review the patch",
      kind: "top_level",
    });
    store.completeRun(reviewCell, {
      data: { verdict: "mixed" },
      display: "review display",
      summary: "review summary",
    });
    writeStoredSessionMetadata({
      session: { sessionId },
      cwd: process.cwd(),
      rootDir,
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
    });

    const child = spawn(process.execPath, ["--eval", MCP_SERVER_BOOTSTRAP], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: home,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const frames = new StdioFrameReader(child.stdout);

    try {
      writeMcpMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "0.0.0",
          },
        },
      });
      const initialize = await readMcpMessage(frames);
      expect(initialize.result?.serverInfo?.name).toBe("nanoboss");

      writeMcpMessage(child.stdin, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

      writeMcpMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });
      const list = await readMcpMessage(frames);
      const toolNames = list.result?.tools?.map((tool) => tool.name) ?? [];
      expect(toolNames).toContain("procedure_dispatch_start");
      expect(toolNames).toContain("procedure_dispatch_wait");
      expect(toolNames).toContain("list_runs");

      writeMcpMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "list_runs",
          arguments: {
            limit: 1,
          },
        },
      });
      const call = await readMcpMessage(frames);
      expect(call.result?.structuredContent?.items?.[0]).toMatchObject({
        run: { sessionId, runId: reviewCell.run.runId },
        procedure: "second-opinion",
        summary: "review summary",
      });
    } finally {
      child.kill();
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      });
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  }, 30_000);

  test("dispatches a procedure through MCP stdio start and wait calls", async () => {
    const home = mkdtempSync(join(tmpdir(), "nanoboss-mcp-home-"));
    const rootDir = mkdtempSync(join(tmpdir(), "nanoboss-mcp-root-"));
    const cwd = mkdtempSync(join(tmpdir(), "nanoboss-mcp-workspace-"));
    const procedureDir = join(cwd, ".nanoboss", "procedures", "review");
    mkdirSync(procedureDir, { recursive: true });
    tempDirs.push(home, rootDir, cwd);

    await Bun.write(join(procedureDir, "index.ts"), [
      "export default {",
      '  name: "review",',
      '  description: "store a durable review result",',
      '  inputHint: "subject to review",',
      '  async execute(prompt) {',
      "    return {",
      '      data: { subject: prompt, verdict: "mixed" },',
      "      display: `reviewed: ${prompt}\\n`,",
      "      summary: `review ${prompt}`,",
      "      memory: `Reviewed ${prompt}.`,",
      "    };",
      "  },",
      "};",
    ].join("\n"));

    const originalHome = process.env.HOME;
    process.env.HOME = home;

    const sessionId = `session-mcp-${crypto.randomUUID()}`;
    writeStoredSessionMetadata({
      session: { sessionId },
      cwd,
      rootDir,
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
    });

    const child = spawn(process.execPath, ["--eval", MCP_SERVER_BOOTSTRAP], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: home,
        NANOBOSS_MCP_TEST_CWD: cwd,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const frames = new StdioFrameReader(child.stdout);

    try {
      writeMcpMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "0.0.0",
          },
        },
      });
      const initialize = await readMcpMessage(frames);
      expect(initialize.result?.serverInfo?.name).toBe("nanoboss");

      writeMcpMessage(child.stdin, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

      writeMcpMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "procedure_dispatch_start",
          arguments: {
            name: "review",
            prompt: "patch",
          },
        },
      });
      const started = await readMcpMessage(frames);
      const dispatchId = expectString(started.result?.structuredContent?.dispatchId);
      expect(dispatchId).toMatch(/^dispatch_/);
      expect(started.result?.structuredContent?.status).toBe("queued");

      let completed: McpMessage | undefined;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        writeMcpMessage(child.stdin, {
          jsonrpc: "2.0",
          id: 3 + attempt,
          method: "tools/call",
          params: {
            name: "procedure_dispatch_wait",
            arguments: {
              dispatchId,
              waitMs: 100,
            },
          },
        });

        const waitResult = await readMcpMessage(frames);
        if (waitResult.result?.structuredContent?.status === "completed") {
          completed = waitResult;
          break;
        }
      }

      expect(completed?.result?.content?.[0]?.text).toBe("reviewed: patch\n");
      expect(completed?.result?.structuredContent?.result).toMatchObject({
        run: { sessionId },
        summary: "review patch",
        display: "reviewed: patch\n",
        memory: "Reviewed patch.",
        dataShape: {
          subject: "patch",
          verdict: "mixed",
        },
      });
    } finally {
      child.kill();
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      });
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  }, 30_000);
});

function writeMcpMessage(
  stdin: NodeJS.WritableStream,
  message: unknown,
): void {
  stdin.write(`${JSON.stringify(message)}\n`);
}

async function readMcpMessage(
  frames: StdioFrameReader,
): Promise<McpMessage> {
  const body = await frames.read();
  return JSON.parse(body) as McpMessage;
}

interface McpMessage {
  result?: {
    serverInfo?: { name?: string };
    tools?: Array<{ name: string }>;
    content?: Array<{ type: string; text: string }>;
    structuredContent?: {
      dispatchId?: unknown;
      status?: unknown;
      result?: unknown;
      items?: Array<{
        run: { sessionId: string; runId: string };
        procedure: string;
        summary?: string;
      }>;
    };
  };
  error?: {
    message?: string;
  };
}

function expectString(value: unknown): string {
  expect(typeof value).toBe("string");
  return value as string;
}

class StdioFrameReader {
  private buffer = Buffer.alloc(0);
  private readonly pending: Array<{
    resolve: (body: string) => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor(stream: NodeJS.ReadableStream) {
    stream.on("data", (chunk: Buffer | string) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      this.flush();
    });
    stream.on("error", (error) => {
      for (const waiter of this.pending.splice(0)) {
        waiter.reject(error);
      }
    });
  }

  read(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.flush();
    });
  }

  private flush(): void {
    while (this.pending.length > 0) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd < 0) {
        return;
      }

      const line = this.buffer.subarray(0, lineEnd).toString("utf8").replace(/\r$/, "");
      this.buffer = this.buffer.subarray(lineEnd + 1);
      if (line.length === 0) {
        continue;
      }

      this.pending.shift()?.resolve(line);
    }
  }
}
