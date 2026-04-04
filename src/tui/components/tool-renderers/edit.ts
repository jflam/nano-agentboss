import type { UiToolCall } from "../../state.ts";
import type { NanobossTuiTheme } from "../../theme.ts";
import {
  formatErrorLines,
  formatPreviewBody,
  formatToolDurationLine,
  formatToolHeader,
  formatWarnings,
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
      formatToolHeader(theme, toolCall.callPreview?.header, toolCall.title),
      formatPreviewBody(theme, toolCall.resultPreview, expanded, {
        collapsedLines: 12,
        lineFormatter: formatDiffLine,
      }),
      formatErrorLines(theme, toolCall.errorPreview, expanded, 12),
      formatWarnings(theme, toolCall.resultPreview),
      formatWarnings(theme, toolCall.errorPreview),
      formatToolDurationLine(theme, toolCall),
    ),
  };
}
