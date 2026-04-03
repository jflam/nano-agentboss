import { describe, expect, test } from "bun:test";

import { runResumeCommand, type StoredSessionSelectionResult } from "../../resume.ts";

describe("runResumeCommand", () => {
  test("returns quietly when the session picker is cancelled", async () => {
    const launches: string[] = [];

    await expect(runResumeCommand(["--list"], {
      assertInteractiveTty: () => {},
      selectStoredSession: async (): Promise<StoredSessionSelectionResult> => ({ kind: "cancelled" }),
      runTuiCli: async (params) => {
        launches.push(params.sessionId);
      },
    })).resolves.toBeUndefined();

    expect(launches).toEqual([]);
  });

  test("still throws when there are no saved sessions to list", async () => {
    await expect(runResumeCommand(["--list"], {
      assertInteractiveTty: () => {},
      selectStoredSession: async (): Promise<StoredSessionSelectionResult> => ({ kind: "empty" }),
    })).rejects.toThrow(`No saved nanoboss sessions found for ${process.cwd()}`);
  });
});
