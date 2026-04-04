import { describe, expect, test } from "bun:test";

import { buildSessionMcpServers } from "../../src/mcp/attachment.ts";

describe("session MCP attachment", () => {
  for (const provider of ["claude", "codex", "gemini", "copilot"] as const) {
    test(`does not attach a session MCP transport for ${provider}`, () => {
      const servers = buildSessionMcpServers({
        config: {
          provider,
          command: provider,
          args: [],
          cwd: process.cwd(),
        },
        sessionId: `session-${provider}`,
        cwd: process.cwd(),
      });

      expect(servers).toEqual([]);
    });
  }
});
