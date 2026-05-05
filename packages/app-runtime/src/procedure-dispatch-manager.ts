import type * as acp from "@agentclientprotocol/sdk";
import type { ProcedureRegistry } from "@nanoboss/procedure-catalog";
import {
  ProcedureDispatchJobManager,
  type ProcedureDispatchStatusResult,
} from "@nanoboss/procedure-engine";
import {
  RunCancelledError,
  defaultCancellationMessage,
} from "@nanoboss/procedure-sdk";

import type { ActiveRunState } from "./active-run.ts";
import {
  extractProcedureDispatchId,
  extractProcedureDispatchStatus,
} from "./procedure-dispatch-result.ts";
import type { SessionState } from "./session-runtime.ts";

export function cancelActiveProcedureDispatches(
  sessionId: string,
  session: SessionState,
  activeRun: ActiveRunState | undefined,
): void {
  if (!activeRun || activeRun.dispatchCorrelationIds.size === 0) {
    return;
  }

  const manager = new ProcedureDispatchJobManager({
    cwd: session.cwd,
    sessionId,
    rootDir: session.store.rootDir,
    getRegistry: async () => {
      throw new Error("Procedure registry is unavailable during cancellation.");
    },
  });

  for (const dispatchCorrelationId of activeRun.dispatchCorrelationIds) {
    manager.cancelByCorrelationId(dispatchCorrelationId);
  }
}

export async function waitForProcedureDispatchResult(params: {
  registry: ProcedureRegistry;
  session: SessionState;
  promptUpdates: acp.SessionUpdate[];
  signal?: AbortSignal;
  softStopSignal?: AbortSignal;
}): Promise<ProcedureDispatchStatusResult | undefined> {
  const dispatchId = extractProcedureDispatchId(params.promptUpdates);
  if (!dispatchId) {
    return undefined;
  }

  const manager = createProcedureDispatchManager(params.session, params.registry);
  let latest = extractProcedureDispatchStatus(params.promptUpdates) ?? await manager.status(dispatchId);
  while (latest.status === "queued" || latest.status === "running") {
    if (params.softStopSignal?.aborted) {
      throw new RunCancelledError(defaultCancellationMessage("soft_stop"), "soft_stop");
    }
    if (params.signal?.aborted) {
      throw new RunCancelledError(defaultCancellationMessage("abort"), "abort");
    }

    latest = await manager.wait(dispatchId, 1_000);
  }

  return latest;
}

function createProcedureDispatchManager(
  session: SessionState,
  registry: ProcedureRegistry,
): ProcedureDispatchJobManager {
  return new ProcedureDispatchJobManager({
    cwd: session.cwd,
    sessionId: session.store.sessionId,
    rootDir: session.store.rootDir,
    getRegistry: async () => registry,
  });
}
