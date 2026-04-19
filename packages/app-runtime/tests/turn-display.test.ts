import { describe, expect, test } from "bun:test";

import { buildTurnDisplay, type PersistedRuntimeEvent } from "@nanoboss/app-runtime";

type Event = PersistedRuntimeEvent;

function textDelta(text: string): Event {
  return { type: "text_delta", runId: "run-1", text, stream: "agent" };
}

function toolStarted(toolCallId: string): Event {
  return {
    type: "tool_started",
    runId: "run-1",
    toolCallId,
    title: `tool ${toolCallId}`,
    kind: "read",
    status: "pending",
  };
}

function toolUpdated(toolCallId: string): Event {
  return {
    type: "tool_updated",
    runId: "run-1",
    toolCallId,
    status: "completed",
  };
}

function procedurePanel(params: {
  panelId: string;
  rendererId?: string;
  payload?: unknown;
  severity?: "info" | "warn" | "error";
  dismissible?: boolean;
  key?: string;
}): Event {
  return {
    type: "procedure_panel",
    runId: "run-1",
    procedure: "demo",
    panelId: params.panelId,
    rendererId: params.rendererId ?? "nb/card@1",
    payload: params.payload ?? { kind: "summary", title: params.panelId, markdown: params.panelId },
    severity: params.severity ?? "info",
    dismissible: params.dismissible ?? true,
    ...(params.key !== undefined ? { key: params.key } : {}),
  };
}

describe("buildTurnDisplay", () => {
  test("projects text deltas and a tool call into three boundary-preserving blocks", () => {
    const display = buildTurnDisplay(
      [
        textDelta("a"),
        toolStarted("t1"),
        toolUpdated("t1"),
        textDelta("b"),
      ],
      { origin: "replay" },
    );

    expect(display.blocks).toEqual([
      { kind: "text", text: "a", origin: "replay" },
      { kind: "tool_call", toolCallId: "t1" },
      { kind: "text", text: "b", origin: "replay" },
    ]);
  });

  test("coalesces consecutive text deltas without an intervening tool event", () => {
    const display = buildTurnDisplay(
      [textDelta("hello "), textDelta("world"), textDelta("!")],
      { origin: "stream" },
    );

    expect(display.blocks).toEqual([
      { kind: "text", text: "hello world!", origin: "stream" },
    ]);
  });

  test("does not duplicate a tool_call block when tool_updated follows tool_started", () => {
    const display = buildTurnDisplay([
      toolStarted("t1"),
      toolUpdated("t1"),
      toolUpdated("t1"),
    ]);

    expect(display.blocks).toEqual([
      { kind: "tool_call", toolCallId: "t1" },
    ]);
  });

  test("projects procedure_panel events as transcript blocks", () => {
    const display = buildTurnDisplay([
      textDelta("before"),
      procedurePanel({
        panelId: "panel-1",
        payload: { kind: "summary", title: "Panel", markdown: "body" },
      }),
      textDelta("after"),
    ]);

    expect(display.blocks).toEqual([
      { kind: "text", text: "before", origin: "replay" },
      {
        kind: "procedure_panel",
        panelId: "panel-1",
        rendererId: "nb/card@1",
        payload: { kind: "summary", title: "Panel", markdown: "body" },
        severity: "info",
        dismissible: true,
      },
      { kind: "text", text: "after", origin: "replay" },
    ]);
  });

  test("replaces keyed procedure_panel blocks in place and preserves ordering", () => {
    const display = buildTurnDisplay([
      procedurePanel({
        panelId: "panel-a",
        payload: { kind: "summary", title: "A", markdown: "a" },
        key: "same",
      }),
      procedurePanel({
        panelId: "panel-b",
        payload: { kind: "summary", title: "B", markdown: "b" },
      }),
      procedurePanel({
        panelId: "panel-a2",
        payload: { kind: "summary", title: "A2", markdown: "a2" },
        key: "same",
      }),
    ]);

    expect(display.blocks).toEqual([
      {
        kind: "procedure_panel",
        panelId: "panel-a2",
        rendererId: "nb/card@1",
        payload: { kind: "summary", title: "A2", markdown: "a2" },
        severity: "info",
        dismissible: true,
        key: "same",
      },
      {
        kind: "procedure_panel",
        panelId: "panel-b",
        rendererId: "nb/card@1",
        payload: { kind: "summary", title: "B", markdown: "b" },
        severity: "info",
        dismissible: true,
      },
    ]);
  });
});
