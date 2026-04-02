import { getBuildLabel } from "./build-info.ts";
import { inferDataShape } from "./data-shape.ts";
import { SessionStore } from "./session-store.ts";
import type {
  CellDescendantsOptions,
  CellFilterOptions,
  CellKind,
  CellRecord,
  CellRef,
  ValueRef,
} from "./types.ts";

const MCP_PROTOCOL_VERSION = "2024-11-05";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface SessionMcpParams {
  sessionId: string;
  cwd: string;
  rootDir?: string;
}

export interface SessionSchemaResult {
  target: CellRef | ValueRef;
  dataShape: unknown;
  explicitDataSchema?: object;
}

export class SessionMcpApi {
  constructor(private readonly params: SessionMcpParams) {}

  sessionLast(): ReturnType<SessionStore["last"]> {
    return this.createStore().last();
  }

  sessionRecent(args: { procedure?: string; limit?: number } = {}): ReturnType<SessionStore["recent"]> {
    return this.createStore().recent(args);
  }

  topLevelRuns(args: Omit<CellFilterOptions, "kind"> = {}): ReturnType<SessionStore["topLevelRuns"]> {
    return this.createStore().topLevelRuns(args);
  }

  cellGet(cellRef: CellRef): CellRecord {
    return this.createStore().readCell(cellRef);
  }

  cellParent(cellRef: CellRef): ReturnType<SessionStore["parent"]> {
    return this.createStore().parent(cellRef);
  }

  cellChildren(
    cellRef: CellRef,
    args: CellFilterOptions = {},
  ): ReturnType<SessionStore["children"]> {
    return this.createStore().children(cellRef, args);
  }

  cellAncestors(
    cellRef: CellRef,
    args: { includeSelf?: boolean; limit?: number } = {},
  ): ReturnType<SessionStore["ancestors"]> {
    return this.createStore().ancestors(cellRef, args);
  }

  cellDescendants(
    cellRef: CellRef,
    args: CellDescendantsOptions = {},
  ): ReturnType<SessionStore["descendants"]> {
    return this.createStore().descendants(cellRef, args);
  }

  refRead(valueRef: ValueRef): unknown {
    return this.createStore().readRef(valueRef);
  }

  refStat(valueRef: ValueRef) {
    return this.createStore().statRef(valueRef);
  }

  refWriteToFile(valueRef: ValueRef, path: string): { path: string } {
    this.createStore().writeRefToFile(valueRef, path, this.params.cwd);
    return { path };
  }

  getSchema(args: { cellRef?: CellRef; valueRef?: ValueRef }): SessionSchemaResult {
    const store = this.createStore();

    if (args.valueRef) {
      const value = store.readRef(args.valueRef);
      return {
        target: args.valueRef,
        dataShape: inferDataShape(value),
      };
    }

    if (!args.cellRef) {
      throw new Error("get_schema requires cellRef or valueRef");
    }

    const cell = store.readCell(args.cellRef);
    return {
      target: args.cellRef,
      dataShape: inferDataShape(cell.output.data),
      explicitDataSchema: cell.output.explicitDataSchema,
    };
  }

  private createStore(): SessionStore {
    return new SessionStore({
      sessionId: this.params.sessionId,
      cwd: this.params.cwd,
      rootDir: this.params.rootDir,
    });
  }
}

export function createSessionMcpApi(params: SessionMcpParams): SessionMcpApi {
  return new SessionMcpApi(params);
}

export async function runSessionMcpServerCommand(): Promise<void> {
  const sessionId = process.env.NANOBOSS_SESSION_ID?.trim();
  const cwd = process.env.NANOBOSS_SESSION_CWD?.trim();
  const rootDir = process.env.NANOBOSS_SESSION_ROOT_DIR?.trim() || undefined;

  if (!sessionId) {
    throw new Error("Missing NANOBOSS_SESSION_ID");
  }

  if (!cwd) {
    throw new Error("Missing NANOBOSS_SESSION_CWD");
  }

  const api = createSessionMcpApi({ sessionId, cwd, rootDir });
  const server = new SessionMcpStdioServer(api);
  server.start();
  await server.closed;
}

class SessionMcpStdioServer {
  private buffer = Buffer.alloc(0);
  private pending = Promise.resolve();
  readonly closed: Promise<void>;

  constructor(private readonly api: SessionMcpApi) {
    this.closed = new Promise((resolve) => {
      process.stdin.on("end", () => {
        resolve();
      });
      process.stdin.on("close", () => {
        resolve();
      });
      process.stdin.on("error", () => {
        resolve();
      });
    });
  }

  start(): void {
    process.stdin.on("data", (chunk: Buffer | string) => {
      const nextChunk = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      this.buffer = Buffer.concat([this.buffer, nextChunk]);
      this.pending = this.pending.then(() => this.drain()).catch((error: unknown) => {
        this.writeError(undefined, -32603, error instanceof Error ? error.message : String(error));
      });
    });
  }

  private async drain(): Promise<void> {
    for (;;) {
      const separatorIndex = this.buffer.indexOf("\r\n\r\n");
      if (separatorIndex < 0) {
        return;
      }

      const headers = this.buffer.subarray(0, separatorIndex).toString("utf8");
      const contentLength = parseContentLength(headers);
      if (contentLength === undefined) {
        throw new Error("Missing Content-Length header");
      }

      const frameEnd = separatorIndex + 4 + contentLength;
      if (this.buffer.length < frameEnd) {
        return;
      }

      const body = this.buffer.subarray(separatorIndex + 4, frameEnd).toString("utf8");
      this.buffer = this.buffer.subarray(frameEnd);
      await this.handleMessage(body);
    }
  }

  private async handleMessage(body: string): Promise<void> {
    const message = JSON.parse(body) as JsonRpcRequest;
    if (!message.method) {
      return;
    }

    if (message.id === undefined || message.id === null) {
      await this.handleNotification(message);
      return;
    }

    try {
      const result = await this.dispatch(message.method, message.params);
      this.writeMessage({
        jsonrpc: "2.0",
        id: message.id,
        result,
      });
    } catch (error) {
      this.writeError(
        message.id,
        -32000,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async handleNotification(message: JsonRpcRequest): Promise<void> {
    if (message.method === "notifications/initialized") {
      return;
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "nanoboss-session",
            version: getBuildLabel(),
          },
          instructions: "Use these tools to inspect durable nanoboss session cells and refs.",
        };
      case "ping":
        return {};
      case "tools/list":
        return {
          tools: listSessionMcpTools(),
        };
      case "tools/call": {
        const args = asObject(params);
        const name = asString(args.name, "name");
        const toolArgs = asOptionalObject(args.arguments);
        return formatSessionMcpToolResult(callSessionMcpTool(this.api, name, toolArgs));
      }
      default:
        throw new Error(`Unsupported MCP method: ${method}`);
    }
  }

  private writeMessage(message: unknown): void {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
    process.stdout.write(body);
  }

  private writeError(id: string | number | null | undefined, code: number, message: string): void {
    this.writeMessage({
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code,
        message,
      },
    });
  }
}

export function listSessionMcpTools(): Array<{ name: string; description: string; inputSchema: object }> {
  const cellRefSchema = {
    type: "object",
    properties: {
      sessionId: { type: "string" },
      cellId: { type: "string" },
    },
    required: ["sessionId", "cellId"],
    additionalProperties: false,
  };
  const valueRefSchema = {
    type: "object",
    properties: {
      cell: cellRefSchema,
      path: { type: "string" },
    },
    required: ["cell", "path"],
    additionalProperties: false,
  };
  const cellKindSchema = {
    type: "string",
    enum: ["top_level", "procedure", "agent"],
  };

  return [
    {
      name: "session_last",
      description: "Return the most recent completed session cell summary.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "session_recent",
      description: "Return recent completed session cell summaries.",
      inputSchema: {
        type: "object",
        properties: {
          procedure: { type: "string" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "top_level_runs",
      description: "Return top-level completed runs in reverse chronological order. Use this for prior chat-visible commands such as /default, /linter, or /second-opinion.",
      inputSchema: {
        type: "object",
        properties: {
          procedure: { type: "string" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "cell_get",
      description: "Return one exact stored cell record.",
      inputSchema: {
        type: "object",
        properties: {
          cellRef: cellRefSchema,
        },
        required: ["cellRef"],
        additionalProperties: false,
      },
    },
    {
      name: "cell_parent",
      description: "Return the direct parent cell summary for one cell, or undefined when the cell is top-level.",
      inputSchema: {
        type: "object",
        properties: {
          cellRef: cellRefSchema,
        },
        required: ["cellRef"],
        additionalProperties: false,
      },
    },
    {
      name: "cell_children",
      description: "Return direct child cell summaries in creation order. If limit is set, returns only the first matching children.",
      inputSchema: {
        type: "object",
        properties: {
          cellRef: cellRefSchema,
          kind: cellKindSchema,
          procedure: { type: "string" },
          limit: { type: "number" },
        },
        required: ["cellRef"],
        additionalProperties: false,
      },
    },
    {
      name: "cell_ancestors",
      description: "Return ancestor cell summaries nearest-first. Set includeSelf to prepend the starting cell.",
      inputSchema: {
        type: "object",
        properties: {
          cellRef: cellRefSchema,
          includeSelf: { type: "boolean" },
          limit: { type: "number" },
        },
        required: ["cellRef"],
        additionalProperties: false,
      },
    },
    {
      name: "cell_descendants",
      description: "Return descendant cell summaries in depth-first pre-order. If limit is set, traversal stops after the first N matching descendants.",
      inputSchema: {
        type: "object",
        properties: {
          cellRef: cellRefSchema,
          kind: cellKindSchema,
          procedure: { type: "string" },
          maxDepth: { type: "number" },
          limit: { type: "number" },
        },
        required: ["cellRef"],
        additionalProperties: false,
      },
    },
    {
      name: "ref_read",
      description: "Read the exact value at a durable session ref.",
      inputSchema: {
        type: "object",
        properties: {
          valueRef: valueRefSchema,
        },
        required: ["valueRef"],
        additionalProperties: false,
      },
    },
    {
      name: "ref_stat",
      description: "Return lightweight metadata for a durable session ref.",
      inputSchema: {
        type: "object",
        properties: {
          valueRef: valueRefSchema,
        },
        required: ["valueRef"],
        additionalProperties: false,
      },
    },
    {
      name: "ref_write_to_file",
      description: "Write a durable session ref to a workspace file.",
      inputSchema: {
        type: "object",
        properties: {
          valueRef: valueRefSchema,
          path: { type: "string" },
        },
        required: ["valueRef", "path"],
        additionalProperties: false,
      },
    },
    {
      name: "get_schema",
      description: "Return compact shape metadata for a cell result or value ref.",
      inputSchema: {
        type: "object",
        properties: {
          cellRef: cellRefSchema,
          valueRef: valueRefSchema,
        },
        additionalProperties: false,
      },
    },
  ];
}

export function callSessionMcpTool(api: SessionMcpApi, name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "session_last":
      return api.sessionLast();
    case "session_recent":
      return api.sessionRecent({
        procedure: asOptionalString(args.procedure),
        limit: asOptionalNonNegativeNumber(args.limit, "limit"),
      });
    case "top_level_runs":
      return api.topLevelRuns({
        procedure: asOptionalString(args.procedure),
        limit: asOptionalNonNegativeNumber(args.limit, "limit"),
      });
    case "cell_get":
      return api.cellGet(parseCellRef(args.cellRef));
    case "cell_parent":
      return api.cellParent(parseCellRef(args.cellRef));
    case "cell_children":
      return api.cellChildren(parseCellRef(args.cellRef), {
        kind: asOptionalCellKind(args.kind),
        procedure: asOptionalString(args.procedure),
        limit: asOptionalNonNegativeNumber(args.limit, "limit"),
      });
    case "cell_ancestors":
      return api.cellAncestors(parseCellRef(args.cellRef), {
        includeSelf: asOptionalBoolean(args.includeSelf),
        limit: asOptionalNonNegativeNumber(args.limit, "limit"),
      });
    case "cell_descendants":
      return api.cellDescendants(parseCellRef(args.cellRef), {
        kind: asOptionalCellKind(args.kind),
        procedure: asOptionalString(args.procedure),
        maxDepth: asOptionalNonNegativeNumber(args.maxDepth, "maxDepth"),
        limit: asOptionalNonNegativeNumber(args.limit, "limit"),
      });
    case "ref_read":
      return api.refRead(parseValueRef(args.valueRef));
    case "ref_stat":
      return api.refStat(parseValueRef(args.valueRef));
    case "ref_write_to_file":
      return api.refWriteToFile(parseValueRef(args.valueRef), asString(args.path, "path"));
    case "get_schema":
      return api.getSchema({
        cellRef: args.cellRef !== undefined ? parseCellRef(args.cellRef) : undefined,
        valueRef: args.valueRef !== undefined ? parseValueRef(args.valueRef) : undefined,
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function formatSessionMcpToolResult(result: unknown): { content: Array<{ type: "text"; text: string }>; structuredContent: unknown } {
  return {
    content: [
      {
        type: "text",
        text: serializeToolResult(result),
      },
    ],
    structuredContent: result,
  };
}

function serializeToolResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (result === undefined) {
    return "null";
  }

  return JSON.stringify(result, null, 2);
}

function parseContentLength(headers: string): number | undefined {
  const match = headers.match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function parseCellRef(value: unknown): CellRef {
  const record = asObject(value);
  return {
    sessionId: asString(record.sessionId, "sessionId"),
    cellId: asString(record.cellId, "cellId"),
  };
}

function parseValueRef(value: unknown): ValueRef {
  const record = asObject(value);
  return {
    cell: parseCellRef(record.cell),
    path: asString(record.path, "path"),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object");
  }

  return value as Record<string, unknown>;
}

function asOptionalObject(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  return asObject(value);
}

function asString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${name} to be a non-empty string`);
  }

  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asOptionalCellKind(value: unknown): CellKind | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "top_level" || value === "procedure" || value === "agent") {
    return value;
  }

  throw new Error("Expected kind to be one of top_level, procedure, or agent");
}

function asOptionalNonNegativeNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Expected ${name} to be a non-negative number`);
  }

  return value;
}
