import { Container, Markdown, Spacer, Text, TruncatedText, type Component } from "./pi-tui.ts";
import type { UiProcedurePanel, UiState, UiToolCall, UiTranscriptItem, UiTurn } from "./state.ts";
import type { NanobossTuiTheme } from "./theme.ts";
import { registerChromeContribution } from "./chrome.ts";
import { MessageCardComponent } from "./components/message-card.ts";
import { ToolCardComponent } from "./components/tool-card.ts";
import { ProcedurePanelTranscriptComponent } from "./views-procedure-panels.ts";

/**
 * Transcript component used by the core "transcript" chrome contribution.
 * Keeps its own children in sync with state.transcriptItems via setState,
 * matching the pre-migration incremental rebuild behavior.
 */
class TranscriptComponent implements Component {
  private readonly container = new Container();

  constructor(
    private readonly theme: NanobossTuiTheme,
    initialState: UiState,
  ) {
    this.setState(initialState);
  }

  setState(state: UiState): void {
    this.container.clear();

    if (state.transcriptItems.length === 0) {
      return;
    }

    const turnById = new Map(state.turns.map((turn): [string, UiTurn] => [turn.id, turn]));
    const toolById = new Map(state.toolCalls.map((toolCall): [string, UiToolCall] => [toolCall.id, toolCall]));
    const panelById = new Map(state.procedurePanels.map((panel): [string, UiProcedurePanel] => [panel.panelId, panel]));
    for (const item of state.transcriptItems) {
      if (item.type === "tool_call" && state.toolCardsHidden) {
        continue;
      }
      const component = createTranscriptEntryComponent(this.theme, item, turnById, toolById, panelById, state, state.expandedToolOutput);
      if (component) {
        this.container.addChild(component);
      }
    }
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }
}

class TurnTranscriptComponent implements Component {
  private readonly container = new Container();

  constructor(
    private readonly theme: NanobossTuiTheme,
    private turn: UiTurn,
  ) {
    this.rebuild();
  }

  setTurn(turn: UiTurn, forceRefresh = false): void {
    if (!forceRefresh && this.turn === turn) {
      return;
    }

    this.turn = turn;
    this.rebuild();
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
    this.rebuild();
  }

  private rebuild(): void {
    this.container.clear();
    this.container.addChild(new TruncatedText(renderTurnLabel(this.theme, this.turn)));
    this.container.addChild(renderTurnBody(this.theme, this.turn));
    this.container.addChild(new Spacer(1));
  }
}

class ToolTranscriptEntryComponent implements Component {
  private readonly container = new Container();

  constructor(
    private readonly theme: NanobossTuiTheme,
    private toolCall: UiToolCall,
    private expanded: boolean,
  ) {
    this.rebuild();
  }

  setToolCall(toolCall: UiToolCall, expanded: boolean, forceRefresh = false): void {
    if (!forceRefresh && this.toolCall === toolCall && this.expanded === expanded) {
      return;
    }

    this.toolCall = toolCall;
    this.expanded = expanded;
    this.rebuild();
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
    this.rebuild();
  }

  private rebuild(): void {
    this.container.clear();
    this.container.addChild(new ToolCardComponent(this.theme, this.toolCall, this.expanded));
    this.container.addChild(new Spacer(1));
  }
}

function createTranscriptEntryComponent(
  theme: NanobossTuiTheme,
  item: UiTranscriptItem,
  turnById: Map<string, UiTurn>,
  toolById: Map<string, UiToolCall>,
  panelById: Map<string, UiProcedurePanel>,
  state: UiState,
  expandedToolOutput: boolean,
): Component | undefined {
  if (item.type === "turn") {
    const turn = turnById.get(item.id);
    return turn ? new TurnTranscriptComponent(theme, turn) : undefined;
  }

  if (item.type === "procedure_panel") {
    const panel = panelById.get(item.id);
    return panel ? new ProcedurePanelTranscriptComponent(theme, panel, state) : undefined;
  }

  const toolCall = toolById.get(item.id);
  return toolCall ? new ToolTranscriptEntryComponent(theme, toolCall, expandedToolOutput) : undefined;
}

function renderTurnLabel(theme: NanobossTuiTheme, turn: UiTurn): string {
  switch (turn.role) {
    case "user":
      return theme.accent("you");
    case "assistant":
      return turn.status === "failed"
        ? theme.error("nanoboss")
        : turn.status === "cancelled"
          ? theme.warning("nanoboss")
          : theme.success("nanoboss");
    case "system":
      return theme.warning("system");
  }
}

function renderTurnBody(theme: NanobossTuiTheme, turn: UiTurn): Component {
  if (turn.role === "assistant") {
    if (turn.displayStyle === "card") {
      return renderMessageCard(theme, turn.markdown, turn.cardTone ?? inferTurnCardTone(turn));
    }

    const container = new Container();
    const textBlocks = (turn.blocks ?? []).filter(
      (block): block is Extract<NonNullable<UiTurn["blocks"]>[number], { kind: "text" }> =>
        block.kind === "text",
    );
    const bodyText = textBlocks.length > 0
      ? textBlocks.map((block) => block.text).join("")
      : turn.markdown;
    container.addChild(bodyText.length === 0
      ? new Text(theme.dim("…"))
      : new Markdown(bodyText, 0, 0, theme.markdown, {
          color: theme.text,
        }));

    if (turn.meta?.statusMessage) {
      container.addChild(new Spacer(1));
      container.addChild(renderMessageCard(theme, turn.meta.statusMessage, "warning"));
    }

    if (turn.meta?.failureMessage) {
      container.addChild(new Spacer(1));
      container.addChild(renderMessageCard(theme, `Error: ${turn.meta.failureMessage}`, "error"));
    }

    if (turn.meta?.completionNote) {
      container.addChild(new Spacer(1));
      container.addChild(renderMessageCard(theme, turn.meta.completionNote, "info"));
    }

    return container;
  }

  if (turn.role === "system") {
    return renderMessageCard(
      theme,
      turn.markdown,
      turn.status === "failed" ? "error" : (turn.cardTone ?? "warning"),
    );
  }

  return new Text(turn.markdown);
}

function renderMessageCard(
  theme: NanobossTuiTheme,
  markdown: string,
  tone: NonNullable<UiTurn["cardTone"]>,
): Component {
  const lines = markdown.length === 0 ? ["…"] : markdown.split("\n");
  return new MessageCardComponent(theme, lines, tone);
}

function inferTurnCardTone(turn: UiTurn): NonNullable<UiTurn["cardTone"]> {
  if (turn.status === "failed") {
    return "error";
  }

  if (turn.status === "cancelled") {
    return "warning";
  }

  if (turn.status === "complete") {
    return "success";
  }

  return "info";
}

registerChromeContribution({
  id: "core.transcript",
  slot: "transcript",
  order: 0,
  render: ({ getState, theme }) => new TranscriptComponent(theme, getState()),
});
