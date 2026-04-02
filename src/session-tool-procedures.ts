import { inferDataShape } from "./data-shape.ts";
import type {
  CellAncestorsOptions,
  CellDescendantsOptions,
  CellRef,
  Procedure,
  SessionRecentOptions,
  TopLevelRunsOptions,
  ValueRef,
} from "./types.ts";

export const sessionToolProcedures: Procedure[] = [
  {
    name: "top_level_runs",
    description: "Inspect top-level completed runs in the current nanoboss session",
    inputHint: "limit=5 procedure=second-opinion or compact JSON",
    async execute(prompt, ctx) {
      const args = parseArgs(prompt, "top_level_runs");
      const options: TopLevelRunsOptions = {
        procedure: optionalString(args.procedure),
        limit: optionalNumber(args.limit, "limit"),
      };
      const result = await ctx.session.topLevelRuns(options);
      return formatJsonResult("top_level_runs", result);
    },
  },
  {
    name: "session_recent",
    description: "Inspect recent completed cells in the current nanoboss session",
    inputHint: "limit=10 procedure=research or compact JSON",
    async execute(prompt, ctx) {
      const args = parseArgs(prompt, "session_recent");
      const options: SessionRecentOptions = {
        procedure: optionalString(args.procedure),
        limit: optionalNumber(args.limit, "limit"),
      };
      const result = await ctx.session.recent(options);
      return formatJsonResult("session_recent", result);
    },
  },
  {
    name: "cell_get",
    description: "Read one exact stored cell record from the current nanoboss session",
    inputHint: "cell=<cell-id> or session=<session-id> cell=<cell-id>",
    async execute(prompt, ctx) {
      const args = parseArgs(prompt, "cell_get");
      const cellRef = parseCellRefArg(args, ctx.sessionId);
      const result = await ctx.session.get(cellRef);
      return formatJsonResult("cell_get", result);
    },
  },
  {
    name: "cell_ancestors",
    description: "Inspect ancestor cell summaries nearest-first in the current nanoboss session",
    inputHint: "cell=<cell-id> limit=1 includeSelf=true",
    async execute(prompt, ctx) {
      const args = parseArgs(prompt, "cell_ancestors");
      const cellRef = parseCellRefArg(args, ctx.sessionId);
      const options: CellAncestorsOptions = {
        includeSelf: optionalBoolean(args.includeSelf, "includeSelf"),
        limit: optionalNumber(args.limit, "limit"),
      };
      const result = await ctx.session.ancestors(cellRef, options);
      return formatJsonResult("cell_ancestors", result);
    },
  },
  {
    name: "cell_descendants",
    description: "Inspect descendant cell summaries in the current nanoboss session",
    inputHint: "cell=<cell-id> maxDepth=1 limit=20 kind=agent",
    async execute(prompt, ctx) {
      const args = parseArgs(prompt, "cell_descendants");
      const cellRef = parseCellRefArg(args, ctx.sessionId);
      const options: CellDescendantsOptions = {
        kind: optionalKind(args.kind),
        procedure: optionalString(args.procedure),
        maxDepth: optionalNumber(args.maxDepth, "maxDepth"),
        limit: optionalNumber(args.limit, "limit"),
      };
      const result = await ctx.session.descendants(cellRef, options);
      return formatJsonResult("cell_descendants", result);
    },
  },
  {
    name: "ref_read",
    description: "Read one exact stored ref value from the current nanoboss session",
    inputHint: "cell=<cell-id> path=output.data or session=<session-id> cell=<cell-id> path=output.data",
    async execute(prompt, ctx) {
      const args = parseArgs(prompt, "ref_read");
      const valueRef = parseValueRefArg(args, ctx.sessionId);
      const result = await ctx.refs.read(valueRef);
      return formatJsonResult("ref_read", result);
    },
  },
  {
    name: "ref_stat",
    description: "Inspect lightweight metadata for a stored ref value in the current nanoboss session",
    inputHint: "cell=<cell-id> path=output.data",
    async execute(prompt, ctx) {
      const args = parseArgs(prompt, "ref_stat");
      const valueRef = parseValueRefArg(args, ctx.sessionId);
      const result = await ctx.refs.stat(valueRef);
      return formatJsonResult("ref_stat", result);
    },
  },
  {
    name: "get_schema",
    description: "Inspect compact shape metadata for a stored cell result or ref value",
    inputHint: "cell=<cell-id> or cell=<cell-id> path=output.data",
    async execute(prompt, ctx) {
      const args = parseArgs(prompt, "get_schema");
      const path = optionalString(args.path);

      if (path) {
        const valueRef = parseValueRefArg(args, ctx.sessionId);
        const value = await ctx.refs.read(valueRef);
        return formatJsonResult("get_schema", {
          target: valueRef,
          dataShape: inferDataShape(value),
        });
      }

      const cellRef = parseCellRefArg(args, ctx.sessionId);
      const cell = await ctx.session.get(cellRef);
      return formatJsonResult("get_schema", {
        target: cellRef,
        dataShape: inferDataShape(cell.output.data),
        explicitDataSchema: cell.output.explicitDataSchema,
      });
    },
  },
];

function parseArgs(prompt: string, commandName: string): Record<string, unknown> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(
        `${commandName} expects compact JSON or key=value input: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${commandName} expects a JSON object`);
    }

    return parsed as Record<string, unknown>;
  }

  return Object.fromEntries(
    trimmed.split(/\s+/)
      .filter(Boolean)
      .map((token) => {
        const separator = token.indexOf("=");
        if (separator < 0) {
          throw new Error(`${commandName} expects key=value input; received ${token}`);
        }

        const key = token.slice(0, separator);
        const value = token.slice(separator + 1);
        return [key, coerceScalar(value)] as const;
      }),
  );
}

function parseCellRefArg(args: Record<string, unknown>, defaultSessionId: string): CellRef {
  const nested = args.cellRef;
  if (nested !== undefined) {
    return parseCellRef(nested, defaultSessionId);
  }

  return parseCellRef(args, defaultSessionId);
}

function parseCellRef(input: unknown, defaultSessionId: string): CellRef {
  if (typeof input === "string" && input.trim()) {
    return {
      sessionId: defaultSessionId,
      cellId: input,
    };
  }

  const record = asRecord(input, "cellRef");
  const cellId = optionalString(record.cellId) ?? optionalString(record.cell);
  if (!cellId) {
    throw new Error("cellRef requires cellId or cell");
  }

  return {
    sessionId: optionalString(record.sessionId) ?? optionalString(record.session) ?? defaultSessionId,
    cellId,
  };
}

function parseValueRefArg(args: Record<string, unknown>, defaultSessionId: string): ValueRef {
  const nested = args.valueRef;
  if (nested !== undefined) {
    return parseValueRef(nested, defaultSessionId);
  }

  return parseValueRef(args, defaultSessionId);
}

function parseValueRef(input: unknown, defaultSessionId: string): ValueRef {
  const record = asRecord(input, "valueRef");
  const path = optionalString(record.path);
  if (!path) {
    throw new Error("valueRef requires path");
  }

  return {
    cell: parseCellRef(record.cellRef ?? record.cell ?? record, defaultSessionId),
    path,
  };
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }

  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }

  return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${name} must be true or false`);
  }

  return value;
}

function optionalKind(value: unknown): "top_level" | "procedure" | "agent" | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "top_level" || value === "procedure" || value === "agent") {
    return value;
  }

  throw new Error("kind must be one of: top_level, procedure, agent");
}

function coerceScalar(value: string): unknown {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  return value;
}

function formatJsonResult(commandName: string, data: unknown) {
  const pretty = JSON.stringify(data, null, 2);
  return {
    data,
    display: `${pretty}\n`,
    summary: summarizeCommandResult(commandName, data),
  };
}

function summarizeCommandResult(commandName: string, data: unknown): string {
  if (Array.isArray(data)) {
    return `${commandName}: ${data.length} result${data.length === 1 ? "" : "s"}`;
  }

  return `${commandName}: ok`;
}
