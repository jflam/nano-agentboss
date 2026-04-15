import type * as acp from "@agentclientprotocol/sdk";
import type {
  AgentInvocationApi,
  AgentSession as ContractAgentSession,
  AgentSessionPromptOptions as ContractAgentSessionPromptOptions,
  AgentSessionPromptResult as ContractAgentSessionPromptResult,
  AgentTokenSnapshot,
  ContinuationUi,
  DownstreamAgentConfig,
  DownstreamAgentProvider,
  KernelValue,
  PromptInput,
} from "@nanoboss/contracts";
import type { ReplayableFrontendEvent } from "../http/frontend-events.ts";
import type { RunTimingTrace } from "./timing-trace.ts";

export type {
  AgentRunResult,
  AgentInvocationApi,
  AgentSessionMode,
  AgentTokenSnapshot,
  AgentTokenUsage,
  BoundAgentInvocationApi,
  CommandCallAgentOptions,
  CommandCallProcedureOptions,
  Continuation,
  ContinuationUi,
  DownstreamAgentConfig,
  DownstreamAgentProvider,
  DownstreamAgentSelection,
  JsonValue,
  KernelScalar,
  KernelValue,
  PendingContinuation,
  Procedure,
  ProcedureApi,
  ProcedureExecutionMode,
  ProcedureInvocationApi,
  ProcedureMetadata,
  ProcedurePromptInput,
  ProcedureRegistryLike,
  ProcedureResult,
  ProcedureSessionMode,
  PromptImagePart,
  PromptImageSummary,
  PromptInput,
  PromptPart,
  Ref,
  RefsApi,
  RefStat,
  RunAncestorsOptions,
  RunDescendantsOptions,
  RunFilterOptions,
  RunKind,
  RunListOptions,
  RunRecord,
  RunRef,
  RunResult,
  RunSummary,
  SessionApi,
  SessionDescriptor,
  SessionMetadata,
  SessionRef,
  Simplify2CheckpointContinuationUi,
  Simplify2CheckpointContinuationUiAction,
  Simplify2FocusPickerContinuationUi,
  Simplify2FocusPickerContinuationUiAction,
  Simplify2FocusPickerContinuationUiEntry,
  StateApi,
  StateRunsApi,
  TypeDescriptor,
  UiApi,
  UiCardKind,
  UiCardParams,
  UiStatusParams,
} from "@nanoboss/contracts";

export {
  createRef,
  createRunRef,
  createSessionRef,
  jsonType,
} from "@nanoboss/contracts";

export interface FrontendContinuation {
  procedure: string;
  question: string;
  inputHint?: string;
  suggestedReplies?: string[];
  ui?: ContinuationUi;
}

export type PersistedFrontendEvent = ReplayableFrontendEvent;

export function publicKernelValueFromStored(value: unknown): KernelValue | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (isStoredValueRefLike(value)) {
    return {
      run: storedRunRefFromCellRef(value.cell),
      path: value.path,
    };
  }

  if (isStoredCellRefLike(value)) {
    return storedRunRefFromCellRef(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => publicKernelValueFromStored(entry) as KernelValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, publicKernelValueFromStored(entry as KernelValue)]),
    );
  }

  return value;
}

function storedRunRefFromCellRef(value: { sessionId: string; cellId: string }) {
  return {
    sessionId: value.sessionId,
    runId: value.cellId,
  };
}

function isStoredCellRefLike(value: unknown): value is { sessionId: string; cellId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sessionId?: unknown }).sessionId === "string" &&
    typeof (value as { cellId?: unknown }).cellId === "string" &&
    !("path" in (value as object))
  );
}

function isStoredValueRefLike(value: unknown): value is {
  cell: { sessionId: string; cellId: string };
  path: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { path?: unknown }).path === "string" &&
    isStoredCellRefLike((value as { cell?: unknown }).cell)
  );
}

export interface AgentSessionPromptOptions extends ContractAgentSessionPromptOptions {
  onUpdate?: CallAgentOptions["onUpdate"];
  timingTrace?: RunTimingTrace;
}

export interface AgentSessionPromptResult extends ContractAgentSessionPromptResult {
  updates: acp.SessionUpdate[];
}

export interface AgentSession extends Omit<ContractAgentSession, "prompt"> {
  prompt(prompt: string | PromptInput, options?: AgentSessionPromptOptions): Promise<AgentSessionPromptResult>;
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
  persistedSessionId?: string;
  namedRefs?: Record<string, unknown>;
  onUpdate?: (update: acp.SessionUpdate) => Promise<void> | void;
  signal?: AbortSignal;
  softStopSignal?: AbortSignal;
  promptInput?: PromptInput;
}

export interface CallAgentTransport {
  invoke(prompt: string, options: CallAgentOptions): Promise<{
    raw: string;
    logFile?: string;
    updates: acp.SessionUpdate[];
    tokenSnapshot?: AgentTokenSnapshot;
  }>;
}
