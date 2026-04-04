import type { UiToolCall } from "../../state.ts";
import type { NanobossTuiTheme } from "../../theme.ts";
import {
  formatErrorLines,
  formatExpandedToolHeader,
  formatPreviewBody,
  formatToolDurationLine,
  formatToolHeader,
  formatWarnings,
  getExpandedToolErrorBlock,
  getExpandedToolInputBlock,
  getExpandedToolResultBlock,
  joinToolContent,
  type RenderedToolCard,
} from "../tool-card-format.ts";

function formatDiffLine(theme: NanobossTuiTheme, line: string): string {
  if (line.startsWith("+")) {
    return theme.success(line);
  }

  if (line.startsWith("-")) {
    return theme.error(line);
  }

  return theme.toolCardMeta(line);
}

export function renderEditToolCard(theme: NanobossTuiTheme, toolCall: UiToolCall, expanded: boolean): RenderedToolCard {
  return {
    lines: joinToolContent(
      formatToolHeader(theme, expanded ? formatExpandedToolHeader(toolCall) : toolCall.callPreview?.header, toolCall.title),
      formatPreviewBody(theme, expanded ? getExpandedToolInputBlock(toolCall) : undefined, expanded, {
        collapsedLines: 12,
        lineFormatter: formatDiffLine,
      }),
      formatPreviewBody(theme, expanded ? getExpandedToolResultBlock(toolCall) ?? toolCall.resultPreview : toolCall.resultPreview, expanded, {
        collapsedLines: 12,
        lineFormatter: formatDiffLine,
      }),
      formatErrorLines(theme, expanded ? getExpandedToolErrorBlock(toolCall) ?? toolCall.errorPreview : toolCall.errorPreview, expanded, 12),
      formatWarnings(theme, toolCall.resultPreview),
      formatWarnings(theme, toolCall.errorPreview),
      formatToolDurationLine(theme, toolCall),
    ),
  };
}
