import { describe, expect, test } from "bun:test";

import {
  buildTopLevelSessionMeta,
  extractNanobossSessionId,
} from "../../src/core/acp-server.ts";

describe("top-level ACP session diagnostics", () => {
  test("reports global MCP plus command exposure", () => {
    expect(buildTopLevelSessionMeta()).toEqual({
      nanoboss: {
        sessionInspection: {
          surface: "global-mcp+commands",
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
          note: "Session inspection is available through the globally registered `nanoboss` MCP server and matching slash commands.",
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
});
