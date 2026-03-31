import type * as acp from "@agentclientprotocol/sdk";
import typia from "typia";
import ts from "typescript";

export type KernelScalar = null | boolean | number | string;

export interface CellRef {
  sessionId: string;
  cellId: string;
}

export interface ValueRef {
  cell: CellRef;
  path: string;
}

export type KernelValue =
  | KernelScalar
  | CellRef
  | ValueRef
  | KernelValue[]
  | object;

export type CellKind = "top_level" | "procedure" | "agent";

export interface CellRecord {
  cellId: string;
  procedure: string;
  input: string;
  output: {
    data?: KernelValue;
    display?: string;
    stream?: string;
    summary?: string;
  };
  meta: {
    createdAt: string;
    parentCellId?: string;
    kind: CellKind;
  };
}

export interface CellSummary {
  cell: CellRef;
  procedure: string;
  summary?: string;
  dataRef?: ValueRef;
  displayRef?: ValueRef;
  streamRef?: ValueRef;
  createdAt: string;
}

export interface RefStat {
  cell: CellRef;
  path: string;
  type: string;
  size: number;
  preview?: string;
}

export interface RefsApi {
  read<T = KernelValue>(valueRef: ValueRef): Promise<T>;
  stat(valueRef: ValueRef): Promise<RefStat>;
  writeToFile(valueRef: ValueRef, path: string): Promise<void>;
}

export interface SessionApi {
  last(): Promise<CellSummary | undefined>;
  recent(options?: { procedure?: string; limit?: number }): Promise<CellSummary[]>;
}

export interface DownstreamAgentConfig {
  provider?: DownstreamAgentProvider;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  model?: string;
  reasoningEffort?: string;
}

export type DownstreamAgentProvider = "claude" | "gemini" | "codex" | "copilot";

export interface DownstreamAgentSelection {
  provider: DownstreamAgentProvider;
  model?: string;
}

export interface TypeDescriptor<T> {
  schema: object;
  validate: (input: unknown) => input is T;
}

export function jsonType<T extends KernelValue>(): TypeDescriptor<T> {
  try {
    const validator = typia.createValidate<T>();

    return {
      schema: typia.json.schema<T>(),
      validate(input: unknown): input is T {
        return validator(input).success;
      },
    };
  } catch (error) {
    if (!isTypiaTransformError(error)) {
      throw error;
    }

    return buildFallbackTypeDescriptor<T>();
  }
}

export interface ProcedureResult<T extends KernelValue = KernelValue> {
  data?: T;
  display?: string;
  summary?: string;
}

export interface RunResult<T extends KernelValue = KernelValue> {
  cell: CellRef;
  data?: T;
  dataRef?: ValueRef;
  displayRef?: ValueRef;
  streamRef?: ValueRef;
  summary?: string;
  rawRef?: ValueRef;
}

export interface AgentRunResult<T extends KernelValue = KernelValue> extends RunResult<T> {
  durationMs: number;
  raw: string;
  logFile?: string;
}

export type AgentResult<T extends KernelValue = KernelValue> = AgentRunResult<T>;

export interface Procedure {
  name: string;
  description: string;
  inputHint?: string;
  execute(prompt: string, ctx: CommandContext): Promise<ProcedureResult | string | void>;
}

export interface ProcedureRegistryLike {
  get(name: string): Procedure | undefined;
  register(procedure: Procedure): void;
  loadProcedureFromPath(path: string): Promise<Procedure>;
  persist(procedure: Procedure, source: string): Promise<string>;
  toAvailableCommands(): acp.AvailableCommand[];
}

export interface CommandCallAgentOptions {
  agent?: DownstreamAgentSelection;
  stream?: boolean;
  refs?: Record<string, CellRef | ValueRef>;
}

export interface CommandContext {
  readonly cwd: string;
  readonly refs: RefsApi;
  readonly session: SessionApi;
  callAgent(
    prompt: string,
    options?: CommandCallAgentOptions,
  ): Promise<RunResult<string>>;
  callAgent<T extends KernelValue>(
    prompt: string,
    descriptor: TypeDescriptor<T>,
    options?: CommandCallAgentOptions,
  ): Promise<RunResult<T>>;
  callProcedure<T extends KernelValue = KernelValue>(
    name: string,
    prompt: string,
  ): Promise<RunResult<T>>;
  print(text: string): void;
}

export interface LogEntry {
  timestamp: string;
  runId: string;
  spanId: string;
  parentSpanId?: string;
  procedure: string;
  kind: "procedure_start" | "procedure_end" | "agent_start" | "agent_end" | "print";
  prompt?: string;
  result?: unknown;
  raw?: string;
  durationMs?: number;
  error?: string;
  agentLogFile?: string;
  agentProvider?: DownstreamAgentProvider;
  agentModel?: string;
}

export interface CallAgentOptions {
  config?: DownstreamAgentConfig;
  namedRefs?: Record<string, unknown>;
  onUpdate?: (update: acp.SessionUpdate) => Promise<void> | void;
  signal?: AbortSignal;
}

export interface CallAgentTransport {
  invoke(prompt: string, options: CallAgentOptions): Promise<{
    raw: string;
    logFile?: string;
    updates: acp.SessionUpdate[];
  }>;
}

function isTypiaTransformError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("no transform has been configured");
}

function buildFallbackTypeDescriptor<T extends KernelValue>(): TypeDescriptor<T> {
  const location = getCallerLocation();
  if (!location) {
    return permissiveTypeDescriptor<T>();
  }

  const program = ts.createProgram([location.filePath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const sourceFile = program.getSourceFile(location.filePath);
  if (!sourceFile) {
    return permissiveTypeDescriptor<T>();
  }

  const checker = program.getTypeChecker();
  const position = ts.getPositionOfLineAndCharacter(
    sourceFile,
    Math.max(0, location.line - 1),
    Math.max(0, location.column - 1),
  );
  const call = findJsonTypeCall(sourceFile, position);
  const typeNode = call?.typeArguments?.[0];
  if (!typeNode) {
    return permissiveTypeDescriptor<T>();
  }

  const type = checker.getTypeFromTypeNode(typeNode);
  const schema = schemaFromType(checker, type, new Map());
  const validator = validatorFromType(checker, type, new Map());

  return {
    schema,
    validate(input: unknown): input is T {
      return validator(input);
    },
  };
}

function permissiveTypeDescriptor<T>(): TypeDescriptor<T> {
  return {
    schema: {},
    validate(_input: unknown): _input is T {
      return true;
    },
  };
}

function getCallerLocation(): { filePath: string; line: number; column: number } | undefined {
  const stack = new Error().stack?.split("\n") ?? [];

  for (const line of stack.slice(2)) {
    const match = line.match(/((?:\/|[A-Za-z]:\\)[^():]+\.(?:[cm]?ts|tsx|[cm]?js|jsx)):(\d+):(\d+)/);
    if (!match) {
      continue;
    }

    const [, filePath, lineText, columnText] = match;
    if (!filePath || !lineText || !columnText) {
      continue;
    }

    if (filePath.includes("node_modules") || filePath.endsWith("/src/types.ts")) {
      continue;
    }

    return {
      filePath,
      line: Number(lineText),
      column: Number(columnText),
    };
  }

  return undefined;
}

function findJsonTypeCall(
  sourceFile: ts.SourceFile,
  position: number,
): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (position < node.getFullStart() || position > node.getEnd()) {
      return;
    }

    if (
      ts.isCallExpression(node) &&
      node.typeArguments?.length === 1 &&
      node.expression.getText(sourceFile).endsWith("jsonType")
    ) {
      found = node;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function schemaFromType(
  checker: ts.TypeChecker,
  type: ts.Type,
  cache: Map<string, object>,
): object {
  const key = memoKey(checker, type);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const primitive = primitiveSchema(type);
  if (primitive) {
    return primitive;
  }

  if (type.isUnion()) {
    const schema = unionSchema(checker, type.types, cache);
    cache.set(key, schema);
    return schema;
  }

  const arrayElement = arrayElementType(checker, type);
  if (arrayElement) {
    const schema = {
      type: "array",
      items: schemaFromType(checker, arrayElement, cache),
    };
    cache.set(key, schema);
    return schema;
  }

  const properties = checker.getPropertiesOfType(type);
  if (properties.length > 0) {
    const schema: {
      type: "object";
      properties: Record<string, object>;
      required?: string[];
      additionalProperties: false;
    } = {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
    cache.set(key, schema);

    const required: string[] = [];
    for (const property of properties) {
      const propertyType = getSymbolType(checker, property);
      schema.properties[property.getName()] = propertyType
        ? schemaFromType(checker, propertyType, cache)
        : {};
      if ((property.flags & ts.SymbolFlags.Optional) === 0) {
        required.push(property.getName());
      }
    }

    if (required.length > 0) {
      schema.required = required;
    }

    return schema;
  }

  const fallback = {};
  cache.set(key, fallback);
  return fallback;
}

function primitiveSchema(type: ts.Type): object | undefined {
  if ((type.flags & ts.TypeFlags.StringLike) !== 0) {
    return { type: "string" };
  }

  if ((type.flags & ts.TypeFlags.NumberLike) !== 0) {
    return { type: "number" };
  }

  if ((type.flags & ts.TypeFlags.BooleanLike) !== 0) {
    return { type: "boolean" };
  }

  if ((type.flags & ts.TypeFlags.Null) !== 0) {
    return { type: "null" };
  }

  return undefined;
}

function unionSchema(
  checker: ts.TypeChecker,
  types: ts.Type[],
  cache: Map<string, object>,
): object {
  const literalValues: Array<string | number | boolean> = [];
  let allLiteralValues = true;
  for (const type of types) {
    const value = extractLiteralValue(type);
    if (value === undefined) {
      allLiteralValues = false;
      break;
    }
    literalValues.push(value);
  }

  if (allLiteralValues) {
    const [firstValue] = literalValues;
    if (firstValue !== undefined) {
      const valueType = typeof firstValue;
      if (literalValues.every((value) => typeof value === valueType)) {
        return {
          type: valueType,
          enum: literalValues,
        };
      }
    }
  }

  const primitiveTypes: string[] = [];
  let allPrimitiveTypes = true;
  for (const type of types) {
    const value = extractPrimitiveTypeName(type);
    if (value === undefined) {
      allPrimitiveTypes = false;
      break;
    }
    primitiveTypes.push(value);
  }

  if (allPrimitiveTypes) {
    const unique = [...new Set(primitiveTypes)];
    const [onlyType] = unique;
    return {
      type: unique.length === 1 ? (onlyType ?? "string") : unique,
    };
  }

  return {
    anyOf: types.map((member) => schemaFromType(checker, member, cache)),
  };
}

function validatorFromType(
  checker: ts.TypeChecker,
  type: ts.Type,
  cache: Map<string, (input: unknown) => boolean>,
): (input: unknown) => boolean {
  const key = memoKey(checker, type);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const primitive = primitiveValidator(type);
  if (primitive) {
    cache.set(key, primitive);
    return primitive;
  }

  if (type.isUnion()) {
    const validators = type.types.map((member) => validatorFromType(checker, member, cache));
    const validate = (input: unknown): boolean => validators.some((candidate) => candidate(input));
    cache.set(key, validate);
    return validate;
  }

  const arrayElement = arrayElementType(checker, type);
  if (arrayElement) {
    const validateItem = validatorFromType(checker, arrayElement, cache);
    const validate = (input: unknown): boolean =>
      Array.isArray(input) && input.every((item) => validateItem(item));
    cache.set(key, validate);
    return validate;
  }

  const properties = checker.getPropertiesOfType(type);
  if (properties.length > 0) {
    const propertyValidators = properties.map((property) => {
      const propertyType = getSymbolType(checker, property);
      return {
        name: property.getName(),
        optional: (property.flags & ts.SymbolFlags.Optional) !== 0,
        validate: propertyType
          ? validatorFromType(checker, propertyType, cache)
          : (_input: unknown): boolean => true,
      };
    });
    const allowedKeys = new Set(propertyValidators.map((property) => property.name));

    const validate = (input: unknown): boolean => {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return false;
      }

      const record = input as Record<string, unknown>;
      for (const keyName of Object.keys(record)) {
        if (!allowedKeys.has(keyName)) {
          return false;
        }
      }

      for (const property of propertyValidators) {
        if (!(property.name in record)) {
          if (!property.optional) {
            return false;
          }
          continue;
        }

        if (!property.validate(record[property.name])) {
          return false;
        }
      }

      return true;
    };

    cache.set(key, validate);
    return validate;
  }

  const permissive = (_input: unknown): boolean => true;
  cache.set(key, permissive);
  return permissive;
}

function primitiveValidator(type: ts.Type): ((input: unknown) => boolean) | undefined {
  const literal = extractLiteralValue(type);
  if (literal !== undefined) {
    return (input: unknown): boolean => input === literal;
  }

  if ((type.flags & ts.TypeFlags.StringLike) !== 0) {
    return (input: unknown): boolean => typeof input === "string";
  }

  if ((type.flags & ts.TypeFlags.NumberLike) !== 0) {
    return (input: unknown): boolean => typeof input === "number";
  }

  if ((type.flags & ts.TypeFlags.BooleanLike) !== 0) {
    return (input: unknown): boolean => typeof input === "boolean";
  }

  if ((type.flags & ts.TypeFlags.Null) !== 0) {
    return (input: unknown): boolean => input === null;
  }

  return undefined;
}

function extractLiteralValue(type: ts.Type): string | number | boolean | undefined {
  if ((type.flags & ts.TypeFlags.StringLiteral) !== 0) {
    return (type as ts.StringLiteralType).value;
  }

  if ((type.flags & ts.TypeFlags.NumberLiteral) !== 0) {
    return (type as ts.NumberLiteralType).value;
  }

  if ((type.flags & ts.TypeFlags.BooleanLiteral) !== 0) {
    return checkerBooleanLiteral(type);
  }

  return undefined;
}

function checkerBooleanLiteral(type: ts.Type): boolean {
  return (type as { intrinsicName?: string }).intrinsicName === "true";
}

function extractPrimitiveTypeName(type: ts.Type): string | undefined {
  if ((type.flags & ts.TypeFlags.StringLike) !== 0) {
    return "string";
  }

  if ((type.flags & ts.TypeFlags.NumberLike) !== 0) {
    return "number";
  }

  if ((type.flags & ts.TypeFlags.BooleanLike) !== 0) {
    return "boolean";
  }

  if ((type.flags & ts.TypeFlags.Null) !== 0) {
    return "null";
  }

  return undefined;
}

function arrayElementType(checker: ts.TypeChecker, type: ts.Type): ts.Type | undefined {
  if (checker.isArrayType(type)) {
    return (type as ts.TypeReference).typeArguments?.[0];
  }

  if (checker.isTupleType(type)) {
    const tuple = type as ts.TupleTypeReference;
    return tuple.typeArguments?.[0];
  }

  return undefined;
}

function getSymbolType(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Type | undefined {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  return declaration ? checker.getTypeOfSymbolAtLocation(symbol, declaration) : undefined;
}

function memoKey(checker: ts.TypeChecker, type: ts.Type): string {
  return `${(type as { id?: number }).id ?? checker.typeToString(type)}:${checker.typeToString(type)}`;
}
