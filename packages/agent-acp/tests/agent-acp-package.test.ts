import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentSession } from "@nanoboss/agent-acp";
import type { DownstreamAgentConfig } from "@nanoboss/procedure-sdk";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MOCK_AGENT_PATH = fileURLToPath(new URL("../../../tests/fixtures/mock-agent.ts", import.meta.url));
const originalHome = process.env.HOME;
const testHome = mkdtempSync(join(tmpdir(), "nanoboss-agent-acp-home-"));

process.env.HOME = testHome;
process.on("exit", () => {
  try {
    rmSync(testHome, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures during test shutdown.
  }

  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

function createMockConfig(
  cwd: string,
  options: {
    supportLoadSession: boolean;
    sessionStoreDir: string;
    provider?: DownstreamAgentConfig["provider"];
  },
): DownstreamAgentConfig {
  return {
    command: "bun",
    args: ["run", MOCK_AGENT_PATH],
    cwd,
    env: {
      MOCK_AGENT_SUPPORT_LOAD_SESSION: options.supportLoadSession ? "1" : "0",
      MOCK_AGENT_SESSION_STORE_DIR: options.sessionStoreDir,
    },
    provider: options.provider,
  };
}

describe("agent-acp package", () => {
  test(
    "creates sessions, reuses a live session, and reloads after close through the package boundary",
    async () => {
      const sessionStoreDir = mkdtempSync(join(tmpdir(), "nab-agent-acp-reuse-"));
      const session = createAgentSession({
        config: createMockConfig(REPO_ROOT, {
          supportLoadSession: true,
          sessionStoreDir,
        }),
      });

      try {
        const first = await session.prompt("what is 2+2");
        expect(first.raw).toBe("4");
        const initialSessionId = session.sessionId;
        expect(initialSessionId).toBeTruthy();

        const reused = await session.prompt("add 3 to result");
        expect(reused.raw).toBe("7");
        expect(session.sessionId).toBe(initialSessionId);

        session.close();

        const reloaded = await session.prompt("add 3 to result");
        expect(reloaded.raw).toBe("10");
        expect(session.sessionId).toBe(initialSessionId);
      } finally {
        session.close();
      }
    },
    30_000,
  );

  test(
    "collects token snapshots and preserves the last snapshot after close through the package boundary",
    async () => {
      const sessionStoreDir = mkdtempSync(join(tmpdir(), "nab-agent-acp-tokens-"));
      const session = createAgentSession({
        config: createMockConfig(REPO_ROOT, {
          supportLoadSession: true,
          sessionStoreDir,
          provider: "codex",
        }),
      });

      try {
        const result = await session.prompt("what is 2+2");
        expect(result.tokenSnapshot).toMatchObject({
          provider: "codex",
          sessionId: session.sessionId,
          source: "acp_usage_update",
          contextWindowTokens: 8192,
          usedContextTokens: 512,
        });

        const snapshotBeforeClose = await session.getCurrentTokenSnapshot();
        expect(snapshotBeforeClose).toEqual(result.tokenSnapshot);

        session.close();

        expect(await session.getCurrentTokenSnapshot()).toEqual(snapshotBeforeClose);
      } finally {
        session.close();
      }
    },
    30_000,
  );
});
