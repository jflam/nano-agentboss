import type {
  DownstreamAgentSelection,
  RunRef,
} from "@nanoboss/contracts";
import type { RunResult } from "@nanoboss/procedure-sdk";

export type ProcedureDispatchJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ProcedureDispatchJob {
  dispatchId: string;
  sessionId: string;
  procedure: string;
  prompt: string;
  status: ProcedureDispatchJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  dispatchCorrelationId: string;
  defaultAgentSelection?: DownstreamAgentSelection;
  run?: RunRef;
  result?: RunResult;
  error?: string;
  workerPid?: number;
}

export interface ProcedureDispatchStartResult {
  dispatchId: string;
  status: Extract<ProcedureDispatchJobStatus, "queued" | "running" | "completed">;
}

export interface ProcedureDispatchStatusResult {
  dispatchId: string;
  status: ProcedureDispatchJobStatus;
  procedure: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  run?: RunRef;
  result?: RunResult;
  error?: string;
}
