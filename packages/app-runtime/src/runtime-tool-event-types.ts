import type { AgentTokenUsage } from "@nanoboss/contracts";
import type { ToolPreviewBlock } from "./tool-call-preview.ts";

export interface RuntimeTokenUsageEvent {
  type: "token_usage";
  runId: string;
  usage: AgentTokenUsage;
  sourceUpdate: "usage_update" | "tool_call_update" | "run_completed" | "run_paused";
  toolCallId?: string;
  status?: string;
}

export interface RuntimeToolStartedEvent {
  type: "tool_started";
  runId: string;
  toolCallId: string;
  parentToolCallId?: string;
  transcriptVisible?: boolean;
  removeOnTerminal?: boolean;
  title: string;
  kind: string;
  toolName?: string;
  status?: string;
  callPreview?: ToolPreviewBlock;
  rawInput?: unknown;
}

export interface RuntimeToolUpdatedEvent {
  type: "tool_updated";
  runId: string;
  toolCallId: string;
  parentToolCallId?: string;
  transcriptVisible?: boolean;
  removeOnTerminal?: boolean;
  title?: string;
  toolName?: string;
  status: string;
  resultPreview?: ToolPreviewBlock;
  errorPreview?: ToolPreviewBlock;
  durationMs?: number;
  rawOutput?: unknown;
}
