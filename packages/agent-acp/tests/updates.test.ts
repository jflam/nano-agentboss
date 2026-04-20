import { describe, expect, test } from "bun:test";

import {
  collectFinalTextSessionOutput,
  collectTextSessionUpdates,
  parseAssistantNoticeText,
} from "@nanoboss/agent-acp";

describe("acp-updates", () => {
  test("recognizes assistant notices", () => {
    expect(parseAssistantNoticeText("Info: Operation cancelled by user\n")).toEqual({
      tone: "info",
      text: "Operation cancelled by user",
    });
    expect(parseAssistantNoticeText("normal response")).toBeUndefined();
  });

  test("omits assistant notices and ui markers from collected raw text", () => {
    expect(collectTextSessionUpdates([
      {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "First sentence. ",
        },
      },
      {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "Info: Operation cancelled by user",
        },
      },
      {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: '[[nanoboss-ui]] {"type":"status","procedure":"research","message":"Gathering sources"}\n',
        },
      },
      {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "Second sentence.",
        },
      },
    ])).toBe("First sentence. Second sentence.");
  });

  test("keeps only the trailing assistant message after tool boundaries for final output", () => {
    expect(collectFinalTextSessionOutput([
      {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "I found the docs; checking exact behavior.",
        },
      },
      {
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "rg",
        kind: "other",
        status: "pending",
      },
      {
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        status: "completed",
      },
      {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "Final answer.",
        },
      },
    ])).toBe("Final answer.");
  });
});
