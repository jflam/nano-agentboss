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

export function renderFindToolCard(theme: NanobossTuiTheme, toolCall: UiToolCall, expanded: boolean): RenderedToolCard {
  return {
    lines: joinToolContent(
      formatToolHeader(theme, toolCall.callPreview?.header, toolCall.title),
      formatPreviewBody(theme, toolCall.resultPreview, expanded, { collapsedLines: 10 }),
      formatErrorLines(theme, toolCall.errorPreview, expanded, 10),
      formatWarnings(theme, toolCall.resultPreview),
      formatWarnings(theme, toolCall.errorPreview),
      formatToolDurationLine(theme, toolCall),
    ),
  };
}
