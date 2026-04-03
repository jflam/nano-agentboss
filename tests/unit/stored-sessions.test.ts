import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import {
  listStoredSessions,
  resolveMostRecentStoredSession,
  writeStoredSessionRecord,
} from "../../src/stored-sessions.ts";

let tempHome: string | undefined;

afterEach(() => {
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
    tempHome = undefined;
  }
});

describe("stored sessions", () => {
  test("lists persisted session metadata", () => {
    const originalHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), "nanoboss-stored-sessions-"));
    process.env.HOME = tempHome;

    try {
      writeStoredSessionRecord({
        sessionId: "session-123",
        cwd: "/repo",
        rootDir: join(tempHome, ".nanoboss", "sessions", "session-123"),
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T11:00:00.000Z",
        initialPrompt: "first prompt",
        defaultAcpSessionId: "acp-123",
      });

      const sessions = listStoredSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        sessionId: "session-123",
        cwd: "/repo",
        initialPrompt: "first prompt",
        hasMetadata: true,
        hasNativeResume: true,
      });
      expect(resolveMostRecentStoredSession("/repo")?.sessionId).toBe("session-123");
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });

  test("falls back to stored cells when metadata is missing", () => {
    const originalHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), "nanoboss-stored-fallback-"));
    process.env.HOME = tempHome;

    try {
      const sessionRoot = join(tempHome, ".nanoboss", "sessions", "session-456");
      const cellsDir = join(sessionRoot, "cells");
      mkdirSync(cellsDir, { recursive: true });
      writeFileSync(join(cellsDir, "1-top-level.json"), `${JSON.stringify({
        cellId: "cell-1",
        procedure: "default",
        input: "hello world",
        meta: {
          createdAt: "2026-04-01T12:00:00.000Z",
          kind: "top_level",
        },
      }, null, 2)}\n`);
      writeFileSync(join(cellsDir, "2-top-level.json"), `${JSON.stringify({
        cellId: "cell-2",
        procedure: "default",
        input: "follow up",
        meta: {
          createdAt: "2026-04-01T13:00:00.000Z",
          kind: "top_level",
          defaultAgentSelection: {
            provider: "codex",
            model: "gpt-5.4/high",
          },
        },
      }, null, 2)}\n`);

      const sessions = listStoredSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        sessionId: "session-456",
        initialPrompt: "hello world",
        lastPrompt: "follow up",
        hasMetadata: false,
        hasNativeResume: false,
        defaultAgentSelection: {
          provider: "codex",
          model: "gpt-5.4/high",
        },
      });
      expect(sessions[0]?.updatedAt).toBe("2026-04-01T13:00:00.000Z");
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });
});
