import type { ToolPreviewBlock } from "../../core/tool-call-preview.ts";
import type { UiToolCall } from "../state.ts";

const DEFAULT_COLLAPSED_LINES = 6;

export type ToolCardTone = "default" | "error" | "warning" | "meta";

export interface ToolCardSection {
  label?: string;
  lines: string[];
  tone?: ToolCardTone;
}

export interface RenderedToolCard {
  title: string;
  metaLine: string;
  sections: ToolCardSection[];
}

export function formatToolMetaLine(toolCall: UiToolCall): string {
  const parts = [formatStatus(toolCall.status)];
  if (toolCall.durationMs !== undefined) {
    parts.push(formatDuration(toolCall.durationMs));
  }
  return parts.join(" • ");
}

export function formatStatus(status: string): string {
  switch (status) {
    case "pending":
      return "pending";
    case "running":
    case "in_progress":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return status;
  }
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

export function normalizeToolName(toolCall: Pick<UiToolCall, "kind" | "title">): string | undefined {
  if (toolCall.kind && toolCall.kind !== "other" && toolCall.kind !== "thought" && toolCall.kind !== "wrapper") {
    return toolCall.kind;
  }

  const title = toolCall.title.toLowerCase();
  if (title.startsWith("mock ")) {
    const parts = title.split(/\s+/);
    return parts[1];
  }

  if (title.startsWith("callagent") || title.startsWith("defaultsession:")) {
    return "agent";
  }

  return title.split(/[\s:(\[]/, 1)[0] || undefined;
}

export function previewBodyLines(
  block: ToolPreviewBlock | undefined,
  expanded: boolean,
  collapsedLines = DEFAULT_COLLAPSED_LINES,
): string[] {
  if (!block?.bodyLines?.length) {
    return [];
  }

  const visibleLines = expanded ? block.bodyLines : block.bodyLines.slice(0, collapsedLines);
  return block.truncated && !expanded && block.bodyLines.length > visibleLines.length
    ? [...visibleLines, `… ${block.bodyLines.length - visibleLines.length} more line${block.bodyLines.length - visibleLines.length === 1 ? "" : "s"}`]
    : visibleLines;
}

export function warningSection(block: ToolPreviewBlock | undefined): ToolCardSection | undefined {
  if (!block?.warnings?.length) {
    return undefined;
  }

  return {
    label: "warnings",
    lines: block.warnings,
    tone: "warning",
  };
}

export function blockSection(
  label: string,
  block: ToolPreviewBlock | undefined,
  expanded: boolean,
  options: {
    collapsedLines?: number;
    tone?: ToolCardTone;
    includeHeaderLine?: boolean;
  } = {},
): ToolCardSection | undefined {
  if (!block) {
    return undefined;
  }

  const lines = [
    ...(options.includeHeaderLine && block.header ? [block.header] : []),
    ...previewBodyLines(block, expanded, options.collapsedLines),
  ];
  if (lines.length === 0) {
    return undefined;
  }

  return {
    label,
    lines,
    tone: options.tone,
  };
}

export function appendSection(
  sections: ToolCardSection[],
  section: ToolCardSection | undefined,
): ToolCardSection[] {
  return section ? [...sections, section] : sections;
}
