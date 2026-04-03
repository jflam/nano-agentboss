import { describe, expect, test } from "bun:test";

import {
  buildTopLevelSessionMeta,
  extractNanobossSessionId,
  hasAttachedSessionMcp,
} from "../../src/server.ts";

describe("top-level ACP session diagnostics", () => {
  test("reports command-only exposure when the attached session MCP is absent", () => {
    expect(buildTopLevelSessionMeta({ attachedSessionMcp: false })).toEqual({
      nanoboss: {
        sessionInspection: {
          attachedSessionMcp: false,
          surface: "commands",
          commandNames: [
            "top_level_runs",
            "session_recent",
            "cell_get",
            "cell_ancestors",
            "cell_descendants",
            "ref_read",
            "ref_stat",
            "get_schema",
          ],
          note: "ACP top-level sessions can advertise availableCommands, but exact session inspection depends on the attached session MCP server.",
        },
      },
    });
  });

  test("reports attached session MCP plus command exposure when the session MCP is attached", () => {
    expect(buildTopLevelSessionMeta({ attachedSessionMcp: true })).toEqual({
      nanoboss: {
        sessionInspection: {
          attachedSessionMcp: true,
          surface: "attached-mcp+commands",
          commandNames: [
            "top_level_runs",
            "session_recent",
            "cell_get",
            "cell_ancestors",
            "cell_descendants",
            "ref_read",
            "ref_stat",
            "get_schema",
          ],
          note: "Session inspection is available through the attached session MCP server and matching slash commands.",
        },
      },
    });
  });

  test("extracts a client-selected nanoboss session id from session metadata", () => {
    expect(extractNanobossSessionId({
      cwd: process.cwd(),
      mcpServers: [],
      _meta: {
        nanobossSessionId: "session-from-client",
      },
    })).toBe("session-from-client");
  });

  test("detects when the client attached the session MCP server", () => {
    expect(hasAttachedSessionMcp({
      cwd: process.cwd(),
      mcpServers: [
        {
          type: "stdio",
          name: "nanoboss-session",
          command: "nanoboss",
          args: ["session-mcp", "--session-id", "session-from-client"],
          env: [],
        },
      ],
    })).toBe(true);
  });
});
