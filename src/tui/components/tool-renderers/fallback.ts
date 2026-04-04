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

export function renderFallbackToolCard(theme: NanobossTuiTheme, toolCall: UiToolCall, expanded: boolean): RenderedToolCard {
  return {
    lines: joinToolContent(
      formatToolHeader(theme, toolCall.callPreview?.header, toolCall.title),
      formatPreviewBody(theme, {
        ...toolCall.callPreview,
        header: undefined,
      }, expanded),
      formatPreviewBody(theme, toolCall.resultPreview, expanded),
      formatErrorLines(theme, toolCall.errorPreview, expanded),
      formatWarnings(theme, toolCall.callPreview),
      formatWarnings(theme, toolCall.resultPreview),
      formatWarnings(theme, toolCall.errorPreview),
      formatToolDurationLine(theme, toolCall),
    ),
  };
}
