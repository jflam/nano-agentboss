import type { RenderedFrontendEventEnvelope } from "@nanoboss/adapters-http";

import type { UiToolCall } from "../state/state.ts";
import { mergeToolPreview } from "./reducer-tool-calls.ts";

export type ToolStartedEvent = Extract<RenderedFrontendEventEnvelope, { type: "tool_started" }>;
export type ToolUpdatedEvent = Extract<RenderedFrontendEventEnvelope, { type: "tool_updated" }>;

interface ToolCallEventBaseInput {
  parentToolCallId?: string;
  transcriptVisible?: boolean;
  removeOnTerminal?: boolean;
  toolName?: string;
}

interface ToolCallEventBase {
  parentToolCallId?: string;
  transcriptVisible: boolean;
  removeOnTerminal: boolean;
  toolName?: string;
  depth: number;
}

export function buildStartedToolCall(
  event: ToolStartedEvent,
  existing: UiToolCall | undefined,
): {
  toolCall: UiToolCall;
  transcriptVisible: boolean;
  removeOnTerminal: boolean;
} {
  const base = buildToolCallEventBase(event.data, existing);

  return {
    toolCall: {
      id: event.data.toolCallId,
      runId: event.data.runId,
      ...toToolCallBaseFields(base),
      title: event.data.title,
      kind: event.data.kind,
      toolName: base.toolName,
      status: event.data.status ?? existing?.status ?? "pending",
      depth: base.depth,
      isWrapper: existing?.isWrapper ?? event.data.kind === "wrapper",
      callPreview: mergeToolPreview(existing?.callPreview, event.data.callPreview),
      resultPreview: existing?.resultPreview,
      errorPreview: existing?.errorPreview,
      rawInput: event.data.rawInput ?? existing?.rawInput,
      rawOutput: existing?.rawOutput,
      durationMs: existing?.durationMs,
    },
    transcriptVisible: base.transcriptVisible,
    removeOnTerminal: base.removeOnTerminal,
  };
}

export function buildUpdatedToolCall(
  event: ToolUpdatedEvent,
  existing: UiToolCall | undefined,
): {
  toolCall: UiToolCall;
  transcriptVisible: boolean;
  removeOnTerminal: boolean;
} {
  const title = event.data.title ?? existing?.title ?? event.data.toolCallId;
  const base = buildToolCallEventBase(event.data, existing);

  return {
    toolCall: {
      id: event.data.toolCallId,
      runId: event.data.runId,
      ...toToolCallBaseFields(base),
      title,
      kind: existing?.kind ?? "other",
      toolName: base.toolName,
      status: event.data.status,
      depth: base.depth,
      isWrapper: existing?.isWrapper ?? existing?.kind === "wrapper",
      callPreview: existing?.callPreview,
      resultPreview: mergeToolPreview(existing?.resultPreview, event.data.resultPreview),
      errorPreview: mergeToolPreview(existing?.errorPreview, event.data.errorPreview),
      rawInput: existing?.rawInput,
      rawOutput: event.data.rawOutput ?? existing?.rawOutput,
      durationMs: event.data.durationMs ?? existing?.durationMs,
    },
    transcriptVisible: base.transcriptVisible,
    removeOnTerminal: base.removeOnTerminal,
  };
}

function buildToolCallEventBase(
  data: ToolCallEventBaseInput,
  existing: UiToolCall | undefined,
): ToolCallEventBase {
  return {
    parentToolCallId: data.parentToolCallId ?? existing?.parentToolCallId,
    transcriptVisible: data.transcriptVisible ?? existing?.transcriptVisible ?? true,
    removeOnTerminal: data.removeOnTerminal ?? existing?.removeOnTerminal ?? false,
    toolName: existing?.toolName ?? data.toolName,
    depth: existing?.depth ?? 0,
  };
}

function toToolCallBaseFields(base: ToolCallEventBase): Partial<UiToolCall> {
  return {
    ...(base.parentToolCallId ? { parentToolCallId: base.parentToolCallId } : {}),
    ...(base.transcriptVisible === false ? { transcriptVisible: base.transcriptVisible } : {}),
    ...(base.removeOnTerminal ? { removeOnTerminal: base.removeOnTerminal } : {}),
  };
}
