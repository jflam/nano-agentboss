import type { UiToolCall } from "../../state.ts";
import {
  appendSection,
  blockSection,
  formatToolMetaLine,
  type RenderedToolCard,
  warningSection,
} from "../tool-card-format.ts";

export function renderFallbackToolCard(toolCall: UiToolCall, expanded: boolean): RenderedToolCard {
  let sections = appendSection([], blockSection("input", toolCall.callPreview, expanded, {
    includeHeaderLine: !toolCall.callPreview?.header,
  }));
  sections = appendSection(sections, blockSection("result", toolCall.resultPreview, expanded));
  sections = appendSection(sections, blockSection("error", toolCall.errorPreview, expanded, { tone: "error" }));
  sections = appendSection(sections, warningSection(toolCall.callPreview));
  sections = appendSection(sections, warningSection(toolCall.resultPreview));
  sections = appendSection(sections, warningSection(toolCall.errorPreview));

  return {
    title: toolCall.callPreview?.header ?? toolCall.title,
    metaLine: formatToolMetaLine(toolCall),
    sections,
  };
}
