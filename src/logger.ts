import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { getRunLogDir } from "./config.ts";
import type { LogEntry } from "./types.ts";

export class RunLogger {
  readonly runId: string;
  readonly filePath: string;

  constructor(runId = crypto.randomUUID(), logDir = getRunLogDir()) {
    this.runId = runId;
    mkdirSync(logDir, { recursive: true });
    this.filePath = join(logDir, `${runId}.jsonl`);
  }

  newSpan(_parentSpanId?: string): string {
    return crypto.randomUUID();
  }

  write(entry: Omit<LogEntry, "timestamp" | "runId">): void {
    const serialized = JSON.stringify({
      timestamp: new Date().toISOString(),
      runId: this.runId,
      ...entry,
    });

    appendFileSync(this.filePath, `${serialized}\n`, "utf8");
  }

  close(): void {}
}
