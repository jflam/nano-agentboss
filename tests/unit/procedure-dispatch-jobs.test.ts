import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ProcedureDispatchJobManager,
  buildProcedureDispatchJobPath,
} from "../../src/procedure-dispatch-jobs.ts";

function createManager(rootDir: string): ProcedureDispatchJobManager {
  return new ProcedureDispatchJobManager({
    cwd: rootDir,
    sessionId: "session-1",
    rootDir,
    getRegistry: async () => ({
      get: () => undefined,
      toAvailableCommands: () => [],
    }),
  });
}

describe("ProcedureDispatchJobManager", () => {
  test("marks queued jobs as failed when their worker pid is dead", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "nab-dispatch-jobs-"));
    mkdirSync(join(rootDir, "procedure-dispatch-jobs"), { recursive: true });

    const dispatchId = "dispatch-dead-worker";
    writeFileSync(buildProcedureDispatchJobPath(rootDir, dispatchId), `${JSON.stringify({
      dispatchId,
      sessionId: "session-1",
      procedure: "research",
      prompt: "investigate",
      status: "queued",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
      dispatchCorrelationId: "corr-1",
      workerPid: 999_999,
    }, null, 2)}\n`);

    const status = await createManager(rootDir).status(dispatchId);

    expect(status.status).toBe("failed");
    expect(status.error).toContain("worker exited before completing");
    expect(status.error).toContain("999999");
  });
});
