import type { UiToolCall } from "../../state.ts";
import {
  appendSection,
  blockSection,
  formatToolMetaLine,
  type RenderedToolCard,
  warningSection,
} from "../tool-card-format.ts";

export function renderGrepToolCard(toolCall: UiToolCall, expanded: boolean): RenderedToolCard {
  let sections = appendSection([], blockSection("matches", toolCall.resultPreview, expanded, {
    collapsedLines: 10,
  }));
  sections = appendSection(sections, blockSection("error", toolCall.errorPreview, expanded, { tone: "error" }));
  sections = appendSection(sections, warningSection(toolCall.resultPreview));
  sections = appendSection(sections, warningSection(toolCall.errorPreview));

  return {
    title: toolCall.callPreview?.header ?? toolCall.title,
    metaLine: formatToolMetaLine(toolCall),
    sections,
  };
}
