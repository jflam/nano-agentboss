import type * as acp from "@agentclientprotocol/sdk";

import { resolveSelfCommand } from "./self-command.ts";
import { createSessionMcpApi, dispatchSessionMcpMethod } from "./session-mcp.ts";

interface SessionMcpStdioParams {
  sessionId: string;
  cwd: string;
  rootDir?: string;
}

interface JsonRpcMessage {
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

const HEADER_SEPARATOR = "\r\n\r\n";

export function buildSessionMcpStdioServer(
  params: SessionMcpStdioParams,
): acp.NewSessionRequest["mcpServers"][number] {
  const command = resolveSelfCommand("session-mcp", [
    "--session-id",
    params.sessionId,
    "--cwd",
    params.cwd,
    ...(params.rootDir ? ["--root-dir", params.rootDir] : []),
  ]);

  return {
    type: "stdio",
    name: "nanoboss-session",
    command: command.command,
    args: command.args,
    env: [],
  };
}

export async function runSessionMcpStdioCommand(argv: string[]): Promise<void> {
  const params = parseSessionMcpCommandArgs(argv);
  const api = createSessionMcpApi(params);
  const server = new SessionMcpStdioServer(api);
  await server.listen();
}

class SessionMcpStdioServer {
  private buffer = Buffer.alloc(0);

  constructor(private readonly api: ReturnType<typeof createSessionMcpApi>) {}

  async listen(): Promise<void> {
    process.stdin.on("data", (chunk: Buffer | string) => {
      this.onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.resume();

    await new Promise<void>((resolve, reject) => {
      process.stdin.once("end", resolve);
      process.stdin.once("close", resolve);
      process.stdin.once("error", reject);
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    for (;;) {
      const body = this.tryReadMessageBody();
      if (body === undefined) {
        return;
      }

      this.handleMessageBody(body);
    }
  }

  private tryReadMessageBody(): string | undefined {
    const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
    if (headerEnd < 0) {
      return undefined;
    }

    const headerBlock = this.buffer.subarray(0, headerEnd).toString("utf8");
    const contentLength = parseContentLength(headerBlock);
    if (contentLength === undefined) {
      throw new Error("Missing Content-Length header");
    }

    const bodyStart = headerEnd + HEADER_SEPARATOR.length;
    const bodyEnd = bodyStart + contentLength;
    if (this.buffer.length < bodyEnd) {
      return undefined;
    }

    const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
    this.buffer = this.buffer.subarray(bodyEnd);
    return body;
  }

  private handleMessageBody(body: string): void {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(body) as JsonRpcMessage;
    } catch {
      this.writeJsonRpc({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
        },
      });
      return;
    }

    if (!message.method) {
      this.writeJsonRpc({
        jsonrpc: "2.0",
        id: message.id ?? null,
        error: {
          code: -32600,
          message: "Invalid Request",
        },
      });
      return;
    }

    if (message.method === "notifications/initialized") {
      return;
    }

    try {
      const result = dispatchSessionMcpMethod(this.api, message.method, message.params);
      if (message.id === undefined) {
        return;
      }

      this.writeJsonRpc({
        jsonrpc: "2.0",
        id: message.id,
        result,
      });
    } catch (error) {
      if (message.id === undefined) {
        return;
      }

      this.writeJsonRpc({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private writeJsonRpc(message: unknown): void {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
    process.stdout.write(header);
    process.stdout.write(body);
  }
}

function parseSessionMcpCommandArgs(argv: string[]): SessionMcpStdioParams {
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let rootDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--session-id":
        sessionId = requireValue(next, "--session-id");
        index += 1;
        break;
      case "--cwd":
        cwd = requireValue(next, "--cwd");
        index += 1;
        break;
      case "--root-dir":
        rootDir = requireValue(next, "--root-dir");
        index += 1;
        break;
      default:
        throw new Error(`Unknown session-mcp arg: ${arg}`);
    }
  }

  if (!sessionId) {
    throw new Error("Missing required arg: --session-id");
  }

  if (!cwd) {
    throw new Error("Missing required arg: --cwd");
  }

  return { sessionId, cwd, rootDir };
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseContentLength(headers: string): number | undefined {
  const match = headers.match(/^content-length:\s*(\d+)\s*$/im);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}
