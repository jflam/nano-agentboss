import { describe, expect, test } from "bun:test";

import {
  buildTopLevelSessionMeta,
  extractNanobossSessionId,
} from "../../src/core/acp-server.ts";

describe("top-level ACP session diagnostics", () => {
  test("reports the global MCP inspection surface", () => {
    expect(buildTopLevelSessionMeta()).toEqual({
      nanoboss: {
        sessionInspection: {
          surface: "global-mcp",
          note: "Session inspection is available through the globally registered `nanoboss` MCP server.",
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
