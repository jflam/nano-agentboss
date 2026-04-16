import type { RuntimeEvent } from "./runtime-events.ts";
import type {
  AgentTokenUsage,
  RunRef,
  RunResult,
} from "@nanoboss/procedure-sdk";

export function buildRunCompletedEvent(params: {
  runId: string;
  procedure: string;
  result: Pick<RunResult, "run" | "summary" | "display">;
  completedAt?: string;
  tokenUsage?: AgentTokenUsage;
}): Extract<RuntimeEvent, { type: "run_completed" }> {
  return {
    type: "run_completed",
    runId: params.runId,
    procedure: params.procedure,
    completedAt: params.completedAt ?? new Date().toISOString(),
    run: params.result.run,
    summary: params.result.summary,
    display: params.result.display,
    tokenUsage: params.tokenUsage,
  };
}

export function buildRunCancelledEvent(params: {
  runId: string;
  procedure: string;
  message: string;
  run?: RunRef;
  completedAt?: string;
}): Extract<RuntimeEvent, { type: "run_cancelled" }> {
  return {
    type: "run_cancelled",
    runId: params.runId,
    procedure: params.procedure,
    completedAt: params.completedAt ?? new Date().toISOString(),
    message: params.message,
    run: params.run,
  };
}

export function buildRunPausedEvent(params: {
  runId: string;
  procedure: string;
  result: Pick<RunResult, "run" | "display" | "pause">;
  pausedAt?: string;
  tokenUsage?: AgentTokenUsage;
}): Extract<RuntimeEvent, { type: "run_paused" }> {
  if (!params.result.pause) {
    throw new Error("Paused run event requires pause metadata.");
  }

  return {
    type: "run_paused",
    runId: params.runId,
    procedure: params.procedure,
    pausedAt: params.pausedAt ?? new Date().toISOString(),
    run: params.result.run,
    question: params.result.pause.question,
    display: params.result.display,
    inputHint: params.result.pause.inputHint,
    suggestedReplies: params.result.pause.suggestedReplies,
    ui: params.result.pause.ui,
    tokenUsage: params.tokenUsage,
  };
}
