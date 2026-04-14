import type { ProcedureExecutionResult } from "../procedure/runner.ts";
import type { ProcedureDispatchStartResult, ProcedureDispatchStatusResult } from "../procedure/dispatch-jobs.ts";
import type {
  DownstreamAgentSelection,
  ProcedureMetadata,
  ProcedureRegistryLike,
  Ref,
  RunRef,
} from "../core/types.ts";

export interface RuntimeServiceParams {
  sessionId?: string;
  cwd: string;
  rootDir?: string;
  registry?: ProcedureRegistryLike;
  allowCurrentSessionFallback?: boolean;
}

export interface ProcedureListResult {
  procedures: ProcedureMetadata[];
}

export type ProcedureDispatchResult = ProcedureExecutionResult;
export type ProcedureDispatchStartToolResult = ProcedureDispatchStartResult;
export type ProcedureDispatchStatusToolResult = ProcedureDispatchStatusResult;

export interface RuntimeSchemaResult {
  target: RunRef | Ref;
  dataShape: unknown;
  explicitDataSchema?: object;
}

export interface ListRunsArgs {
  sessionId?: string;
  procedure?: string;
  limit?: number;
  scope?: "recent" | "top_level";
}

export interface RuntimeService {
  listRuns(args?: ListRunsArgs): unknown;
  getRun(runRef: RunRef): unknown;
  getRunAncestors(runRef: RunRef, args?: { includeSelf?: boolean; limit?: number }): unknown;
  getRunDescendants(runRef: RunRef, args?: unknown): unknown;
  refRead(ref: Ref): unknown;
  refStat(ref: Ref): unknown;
  refWriteToFile(ref: Ref, path: string): { path: string };
  getSchema(args: { runRef?: RunRef; ref?: Ref }): RuntimeSchemaResult;
  procedureList(args?: { includeHidden?: boolean; sessionId?: string }): Promise<ProcedureListResult>;
  procedureGet(args: { name: string; sessionId?: string }): Promise<ProcedureMetadata>;
  procedureDispatchStart(args: {
    sessionId?: string;
    name: string;
    prompt: string;
    defaultAgentSelection?: DownstreamAgentSelection;
    dispatchCorrelationId?: string;
  }): Promise<ProcedureDispatchStartToolResult>;
  procedureDispatchStatus(args: { dispatchId: string }): Promise<ProcedureDispatchStatusToolResult>;
  procedureDispatchWait(args: { dispatchId: string; waitMs?: number }): Promise<ProcedureDispatchStatusToolResult>;
}

export function isProcedureDispatchStatusResult(value: unknown): value is ProcedureDispatchStatusToolResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { dispatchId?: unknown }).dispatchId === "string" &&
    typeof (value as { procedure?: unknown }).procedure === "string" &&
    typeof (value as { status?: unknown }).status === "string"
  );
}

export function isProcedureDispatchResult(value: unknown): value is ProcedureDispatchResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { procedure?: unknown }).procedure === "string" &&
    isRunRefLike((value as { run?: unknown }).run) &&
    typeof (value as { status?: unknown }).status !== "string" &&
    typeof (value as { dispatchId?: unknown }).dispatchId !== "string"
  );
}

function isRunRefLike(value: unknown): value is RunRef {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sessionId?: unknown }).sessionId === "string" &&
    typeof (value as { runId?: unknown }).runId === "string"
  );
}
