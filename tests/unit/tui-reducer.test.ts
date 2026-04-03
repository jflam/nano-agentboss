import { describe, expect, test } from "bun:test";

import { reduceUiState } from "../../src/tui/reducer.ts";
import { createInitialUiState } from "../../src/tui/state.ts";
import type { FrontendEventEnvelope } from "../../src/frontend-events.ts";

describe("tui reducer", () => {
  test("tracks a streamed run lifecycle and reenables input on completion", () => {
    let state = createInitialUiState({ cwd: "/repo", buildLabel: "nanoboss-test" });

    state = reduceUiState(state, {
      type: "session_ready",
      sessionId: "session-1",
      buildLabel: "nanoboss-test",
      agentLabel: "copilot/default",
      commands: [{ name: "tokens", description: "show tokens" }],
    });

    state = reduceUiState(state, {
      type: "local_user_submitted",
      text: "hello",
    });

    state = reduceUiState(state, {
      type: "frontend_event",
      event: eventEnvelope("run_started", {
        runId: "run-1",
        procedure: "default",
        prompt: "hello",
        startedAt: new Date(0).toISOString(),
      }),
    });

    state = reduceUiState(state, {
      type: "frontend_event",
      event: eventEnvelope("text_delta", {
        runId: "run-1",
        text: "hi",
        stream: "agent",
      }),
    });
    state = reduceUiState(state, {
      type: "frontend_event",
      event: eventEnvelope("text_delta", {
        runId: "run-1",
        text: " there",
        stream: "agent",
      }),
    });

    state = reduceUiState(state, {
      type: "frontend_event",
      event: eventEnvelope("run_completed", {
        runId: "run-1",
        procedure: "default",
        completedAt: new Date(1).toISOString(),
        cell: { sessionId: "session-1", cellId: "cell-1" },
        tokenUsage: {
          source: "acp_usage_update",
          currentContextTokens: 512,
          maxContextTokens: 8192,
        },
      }),
    });

    expect(state.turns.map((turn) => ({ role: turn.role, markdown: turn.markdown, status: turn.status }))).toEqual([
      { role: "user", markdown: "hello", status: "complete" },
      { role: "assistant", markdown: "hi there", status: "complete" },
    ]);
    expect(state.turns[1]?.meta?.tokenUsageLine).toContain("[tokens] 512 / 8,192");
    expect(state.inputDisabled).toBe(false);
    expect(state.activeRunId).toBeUndefined();
  });

  test("tracks nested wrapper tool depth", () => {
    let state = createInitialUiState({ cwd: "/repo", showToolCalls: true });

    state = reduceUiState(state, {
      type: "frontend_event",
      event: eventEnvelope("run_started", {
        runId: "run-1",
        procedure: "default",
        prompt: "hello",
        startedAt: new Date(0).toISOString(),
      }),
    });

    state = reduceUiState(state, {
      type: "frontend_event",
      event: eventEnvelope("tool_started", {
        runId: "run-1",
        toolCallId: "tool-parent",
        title: "defaultSession: hello",
        kind: "wrapper",
      }),
    });

    state = reduceUiState(state, {
      type: "frontend_event",
      event: eventEnvelope("tool_started", {
        runId: "run-1",
        toolCallId: "tool-child",
        title: "Mock read README.md",
        kind: "read",
      }),
    });

    expect(state.toolCalls).toEqual([
      {
        id: "tool-parent",
        title: "defaultSession: hello",
        status: "pending",
        depth: 0,
        isWrapper: true,
      },
      {
        id: "tool-child",
        title: "Mock read README.md",
        status: "pending",
        depth: 1,
        isWrapper: false,
      },
    ]);
  });

  test("merges local slash commands with server commands", () => {
    let state = createInitialUiState();

    state = reduceUiState(state, {
      type: "session_ready",
      sessionId: "session-1",
      buildLabel: "nanoboss-test",
      agentLabel: "copilot/default",
      commands: [{ name: "tokens", description: "show tokens" }],
    });

    expect(state.availableCommands).toEqual([
      "/tokens",
      "/new",
      "/end",
      "/quit",
      "/exit",
      "/model",
    ]);
  });
});

function eventEnvelope<EventType extends FrontendEventEnvelope["type"]>(
  type: EventType,
  data: Extract<FrontendEventEnvelope, { type: EventType }>["data"],
): FrontendEventEnvelope {
  return {
    sessionId: "session-1",
    seq: 1,
    type,
    data,
  } as FrontendEventEnvelope;
}
