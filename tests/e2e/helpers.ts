import { describe } from "bun:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

export const runRealAgentE2E =
  process.env.SKIP_E2E !== "1" && process.env.NANOBOSS_RUN_E2E === "1";

export const describeE2E = runRealAgentE2E ? describe : describe.skip;

export interface SpawnedProcess {
  process: ChildProcessWithoutNullStreams;
  stdout: () => string;
  stderr: () => string;
  write(input: string): void;
  stop(): Promise<void>;
}

export async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to reserve port");
  }

  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return port;
}

export function mockAgentEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...process.env,
    NANOBOSS_AGENT_CMD: "bun",
    NANOBOSS_AGENT_ARGS: JSON.stringify(["run", "tests/fixtures/mock-agent.ts"]),
    ...extra,
  } as Record<string, string>;
}

export function spawnNanoboss(args: string[], env: Record<string, string>): SpawnedProcess {
  const child = spawn("bun", ["run", "nanoboss.ts", ...args], {
    cwd: process.cwd(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return {
    process: child,
    stdout: () => stdout,
    stderr: () => stderr,
    write(input: string) {
      child.stdin.write(input);
    },
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill();
      await once(child, "exit");
    },
  };
}

export async function waitForHealth(baseUrl: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const response = await fetch(new URL("/v1/health", baseUrl));
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for health at ${baseUrl}`);
    }

    await Bun.sleep(100);
  }
}

const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-9;]*[A-Za-z]`, "g");

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, "").replace(/\r/g, "");
}

export async function waitForMatch(
  producer: () => string,
  matcher: RegExp | string,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const current = producer();
    if (typeof matcher === "string" ? current.includes(matcher) : matcher.test(current)) {
      return current;
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for match ${String(matcher)} in output:\n${current}`);
    }

    await Bun.sleep(50);
  }
}

export async function waitForCountWithActivity<T extends { seq: number; type: string }>(params: {
  events: T[];
  countMatches: (events: T[]) => number;
  targetCount: number;
  idleTimeoutMs?: number;
  maxTotalTimeoutMs?: number;
  label?: string;
}): Promise<void> {
  const idleTimeoutMs = params.idleTimeoutMs ?? 30_000;
  const maxTotalTimeoutMs = params.maxTotalTimeoutMs ?? 3_600_000;
  const startedAt = Date.now();
  let lastActivityAt = startedAt;
  let lastSeenSeq = params.events.at(-1)?.seq ?? -1;

  for (;;) {
    const currentCount = params.countMatches(params.events);
    if (currentCount >= params.targetCount) {
      return;
    }

    const currentSeq = params.events.at(-1)?.seq ?? -1;
    if (currentSeq !== lastSeenSeq) {
      lastSeenSeq = currentSeq;
      lastActivityAt = Date.now();
    }

    const now = Date.now();
    if (now - lastActivityAt >= idleTimeoutMs) {
      throw new Error([
        `Timed out waiting for ${params.label ?? "target event count"}: matched ${currentCount}/${params.targetCount}.`,
        `No frontend activity for ${idleTimeoutMs}ms.`,
        `Recent events: ${summarizeRecentEvents(params.events)}`,
      ].join("\n"));
    }

    if (now - startedAt >= maxTotalTimeoutMs) {
      throw new Error([
        `Timed out waiting for ${params.label ?? "target event count"}: matched ${currentCount}/${params.targetCount}.`,
        `Exceeded safety cap of ${maxTotalTimeoutMs}ms despite continued activity.`,
        `Recent events: ${summarizeRecentEvents(params.events)}`,
      ].join("\n"));
    }

    await Bun.sleep(50);
  }
}

function summarizeRecentEvents(events: Array<{ seq: number; type: string }>): string {
  const tail = events.slice(-20);
  if (tail.length === 0) {
    return "<none>";
  }

  return tail.map((event) => `${event.seq}:${event.type}`).join(", ");
}
