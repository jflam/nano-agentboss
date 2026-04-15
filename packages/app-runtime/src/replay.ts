import type { SessionStore } from "@nanoboss/store";

import {
  SessionEventLog,
  isPersistedRuntimeEvent,
  toPersistedRuntimeEvent,
  type PersistedRuntimeEvent,
} from "./runtime-events.ts";

type RestoredRunTerminalEvent = Extract<
  PersistedRuntimeEvent,
  { type: "run_completed" | "run_paused" | "run_failed" | "run_cancelled" }
>;

export function restorePersistedSessionHistory(params: {
  sessionId: string;
  store: SessionStore;
  events: SessionEventLog;
}): void {
  const runs = params.store.listRuns().reverse();
  for (const summary of runs) {
    const record = params.store.getRun(summary.run);
    const replayEvents = record.output.replayEvents?.filter(isPersistedRuntimeEvent);
    const terminalEvent = getRestoredRunTerminalEvent(replayEvents);
    const runId = replayEvents?.[0]?.runId ?? record.run.runId;

    params.events.publish(params.sessionId, {
      type: "run_restored",
      runId,
      procedure: record.procedure,
      prompt: record.input,
      completedAt: getRestoredRunEndedAt(terminalEvent) ?? record.meta.createdAt,
      run: record.run,
      status: getRestoredRunStatus(terminalEvent),
      ...(replayEvents && replayEvents.length > 0
        ? {}
        : { text: record.output.display ?? record.output.summary }),
    });

    for (const replayEvent of replayEvents ?? []) {
      params.events.publish(params.sessionId, replayEvent);
    }
  }
}

export function capturePersistedRuntimeEvents(
  eventLog: SessionEventLog,
  runId: string,
): {
  replayEvents: PersistedRuntimeEvent[];
  stop: () => void;
} {
  const replayEvents: PersistedRuntimeEvent[] = [];
  const stop = eventLog.subscribe((event) => {
    const replayEvent = toPersistedRuntimeEvent(event, runId);
    if (replayEvent) {
      replayEvents.push(replayEvent);
    }
  });

  return {
    replayEvents,
    stop,
  };
}

function getRestoredRunTerminalEvent(
  replayEvents: PersistedRuntimeEvent[] | undefined,
): RestoredRunTerminalEvent | undefined {
  return [...(replayEvents ?? [])].reverse().find(isRestoredRunTerminalEvent);
}

function isRestoredRunTerminalEvent(event: PersistedRuntimeEvent): event is RestoredRunTerminalEvent {
  return event.type === "run_completed"
    || event.type === "run_paused"
    || event.type === "run_failed"
    || event.type === "run_cancelled";
}

function getRestoredRunEndedAt(event: RestoredRunTerminalEvent | undefined): string | undefined {
  if (!event) {
    return undefined;
  }

  return event.type === "run_paused" ? event.pausedAt : event.completedAt;
}

function getRestoredRunStatus(
  event: RestoredRunTerminalEvent | undefined,
): "complete" | "failed" | "cancelled" | "paused" {
  switch (event?.type) {
    case "run_failed":
      return "failed";
    case "run_cancelled":
      return "cancelled";
    case "run_paused":
      return "paused";
    default:
      return "complete";
  }
}
