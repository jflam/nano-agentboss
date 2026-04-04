import { Box, Container, Text, type Component } from "../pi-tui.ts";
import type { UiToolCall } from "../state.ts";
import type { NanobossTuiTheme } from "../theme.ts";

import { renderToolCard } from "./tool-renderers/index.ts";
import type { ToolCardSection } from "./tool-card-format.ts";

export class ToolCardComponent implements Component {
  private readonly container = new Container();

  constructor(
    private readonly theme: NanobossTuiTheme,
    private readonly toolCall: UiToolCall,
    private readonly expanded: boolean,
  ) {
    this.rebuild();
  }

  invalidate(): void {
    this.container.invalidate();
    this.rebuild();
  }

  render(width: number): string[] {
    const indent = "  ".repeat(this.toolCall.depth);
    const innerWidth = Math.max(12, width - indent.length);
    return this.container.render(innerWidth).map((line) => `${indent}${line}`);
  }

  private rebuild(): void {
    this.container.clear();

    const formatted = renderToolCard(this.toolCall, this.expanded);
    const lines = [
      `${statusGlyph(this.theme, this.toolCall.status)} ${this.theme.toolCardTitle(formatted.title)}`,
      this.theme.toolCardMeta(formatted.metaLine),
      ...formatSections(this.theme, formatted.sections),
    ];

    const box = new Box(1, 0, backgroundForStatus(this.theme, this.toolCall.status));
    box.addChild(new Text(lines.join("\n"), 0, 0));
    this.container.addChild(box);
  }
}

function formatSections(theme: NanobossTuiTheme, sections: ToolCardSection[]): string[] {
  const lines: string[] = [];

  for (const section of sections) {
    if (section.label) {
      lines.push(theme.toolCardMeta(section.label));
    }

    for (const line of section.lines) {
      lines.push(`  ${styleSectionLine(theme, section, line)}`);
    }
  }

  return lines;
}

function styleSectionLine(theme: NanobossTuiTheme, section: ToolCardSection, line: string): string {
  switch (section.tone) {
    case "error":
      return theme.error(line);
    case "warning":
      return theme.warning(line);
    case "meta":
      return theme.toolCardMeta(line);
    default:
      return theme.toolCardBody(line);
  }
}

function backgroundForStatus(theme: NanobossTuiTheme, status: string): (text: string) => string {
  if (status === "failed" || status === "cancelled") {
    return theme.toolCardErrorBg;
  }

  if (status === "completed") {
    return theme.toolCardSuccessBg;
  }

  return theme.toolCardPendingBg;
}

function statusGlyph(theme: NanobossTuiTheme, status: string): string {
  if (status === "failed" || status === "cancelled") {
    return theme.error("●");
  }

  if (status === "completed") {
    return theme.success("●");
  }

  return theme.warning("●");
}
