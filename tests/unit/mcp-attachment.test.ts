import { describe, expect, test } from "bun:test";

import { buildSessionMcpServers } from "../../src/mcp-attachment.ts";

describe("session MCP attachment", () => {
  for (const provider of ["claude", "codex", "gemini", "copilot"] as const) {
    test(`uses stdio transport for ${provider} ACP sessions`, () => {
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

      expect(servers).toHaveLength(1);
      const server = servers[0];
      expect(server).toBeDefined();
      expect(server).toMatchObject({
        type: "stdio",
        name: "nanoboss-session",
      });
      expect(server && "command" in server ? server.command : undefined).toBeTruthy();
      expect(Array.isArray(server && "args" in server ? server.args : undefined)).toBe(true);
      expect(server && "args" in server ? server.args : undefined).toEqual(expect.arrayContaining([
        "session-mcp",
        "--session-id",
        `session-${provider}`,
        "--cwd",
        process.cwd(),
      ]));
    });
  }
});
