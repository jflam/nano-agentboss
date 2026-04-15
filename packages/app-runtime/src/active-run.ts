import { SessionEventLog } from "./runtime-events.ts";

export interface ActiveRunState {
  runId: string;
  abortController: AbortController;
  softStopController: AbortController;
  softStopRequested: boolean;
  dispatchCorrelationIds: Set<string>;
}

export function createActiveRunState(): ActiveRunState {
  return {
    runId: crypto.randomUUID(),
    abortController: new AbortController(),
    softStopController: new AbortController(),
    softStopRequested: false,
    dispatchCorrelationIds: new Set<string>(),
  };
}

export function startRunHeartbeat(params: {
  eventLog: SessionEventLog;
  sessionId: string;
  runId: string;
  procedure: string;
}): {
  markRunActivity: () => void;
  stop: () => void;
} {
  let lastRunActivityAt = Date.now();
  const markRunActivity = () => {
    lastRunActivityAt = Date.now();
  };
  const heartbeatMs = getRunHeartbeatMs();
  const timer = setInterval(() => {
    if (Date.now() - lastRunActivityAt < heartbeatMs) {
      return;
    }

    params.eventLog.publish(params.sessionId, {
      type: "run_heartbeat",
      runId: params.runId,
      procedure: params.procedure,
      at: new Date().toISOString(),
    });
    markRunActivity();
  }, heartbeatMs);

  return {
    markRunActivity,
    stop() {
      clearInterval(timer);
    },
  };
}

function getRunHeartbeatMs(): number {
  const value = Number(process.env.NANOBOSS_RUN_HEARTBEAT_MS ?? "5000");
  return Number.isFinite(value) && value > 0 ? value : 5000;
}
