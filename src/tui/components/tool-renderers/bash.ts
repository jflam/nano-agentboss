import type { UiToolCall } from "../../state.ts";
import {
  appendSection,
  blockSection,
  formatToolMetaLine,
  type RenderedToolCard,
  warningSection,
} from "../tool-card-format.ts";

export function renderBashToolCard(toolCall: UiToolCall, expanded: boolean): RenderedToolCard {
  let sections = appendSection([], blockSection("output", toolCall.resultPreview, expanded, {
    collapsedLines: 8,
  }));
  sections = appendSection(sections, blockSection("error", toolCall.errorPreview, expanded, {
    tone: "error",
    collapsedLines: 8,
  }));
  sections = appendSection(sections, warningSection(toolCall.resultPreview));
  sections = appendSection(sections, warningSection(toolCall.errorPreview));

  return {
    title: toolCall.callPreview?.header ?? toolCall.title,
    metaLine: formatToolMetaLine(toolCall),
    sections,
  };
}
