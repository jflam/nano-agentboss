import { describe, expect, test } from "bun:test";

import {
  createHttpSession,
  sendSessionPrompt,
  startSessionEventStream,
} from "../../src/http-client.ts";
import type { FrontendEventEnvelope } from "../../src/frontend-events.ts";
import { reservePort, spawnNanoboss, waitForHealth, waitForMatch } from "./helpers.ts";

const runDispatchRecoveryE2E =
  process.env.SKIP_E2E !== "1" &&
  process.env.NANOBOSS_RUN_E2E === "1" &&
  process.env.NANOBOSS_RUN_DISPATCH_RECOVERY_E2E === "1";

const describeDispatchRecoveryE2E = runDispatchRecoveryE2E ? describe : describe.skip;

// Opt-in real-agent regression scenario for the production failure class where
// the outer procedure_dispatch MCP call times out but the durable session cell
// still lands and can be recovered.
describeDispatchRecoveryE2E("procedure_dispatch recovery (real agent opt-in)", () => {
  test("/research keeps nested visibility, master-session token usage, and optional timeout recovery", async () => {
    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = spawnNanoboss([
      "server",
      "--port",
      String(port),
    ], realAgentEnv());

    try {
      await waitForHealth(baseUrl, 20_000);

      const session = await createHttpSession(baseUrl, process.cwd());
      const events: FrontendEventEnvelope[] = [];
      const errors: string[] = [];
      const stream = startSessionEventStream({
        baseUrl,
        sessionId: session.sessionId,
        onEvent(event) {
          events.push(event);
        },
        onError(error) {
          errors.push(error instanceof Error ? error.message : String(error));
        },
      });

      try {
        await sendSessionPrompt(
          baseUrl,
          session.sessionId,
          "/research write a detailed report about the current nanoboss session-mcp architecture",
        );
        await waitForCompletedRuns(events, 1);

        const firstCompleted = completedRuns(events)[0];
        expect(firstCompleted?.data.procedure).toBe("research");
        expect(firstCompleted?.data.tokenUsage).toBeDefined();

        const toolTitles = events
          .filter((event) => event.type === "tool_started")
          .map((event) => event.data.title);
        expect(toolTitles.some((title) => title.includes("procedure_dispatch"))).toBe(true);
        expect(toolTitles.some((title) => title.startsWith("callAgent:"))).toBe(true);

        await sendSessionPrompt(
          baseUrl,
          session.sessionId,
          "Summarize that result in one sentence.",
        );
        await waitForCompletedRuns(events, 2);

        if (process.env.NANOBOSS_EXPECT_TIMEOUT_RECOVERY === "1") {
          const diagnostics = [...events].reverse().find(
            (event): event is Extract<FrontendEventEnvelope, { type: "prompt_diagnostics" }> => event.type === "prompt_diagnostics",
          );
          expect(diagnostics?.type).toBe("prompt_diagnostics");
          expect(diagnostics?.data.diagnostics.guidanceTokens).toBeGreaterThan(0);
        }

        expect(errors).toEqual([]);
      } finally {
        stream.close();
      }
    } finally {
      await server.stop();
    }
  }, 240_000);
});

function completedRuns(events: FrontendEventEnvelope[]) {
  return events.filter(
    (event): event is Extract<FrontendEventEnvelope, { type: "run_completed" }> => event.type === "run_completed",
  );
}

async function waitForCompletedRuns(
  events: FrontendEventEnvelope[],
  count: number,
): Promise<void> {
  await waitForMatch(() => String(completedRuns(events).length), String(count), 180_000);
}

function realAgentEnv(): Record<string, string> {
  return {
    ...process.env,
    NANOBOSS_HTTP_IDLE_TIMEOUT_SECONDS: process.env.NANOBOSS_HTTP_IDLE_TIMEOUT_SECONDS ?? "5",
    NANOBOSS_SSE_KEEPALIVE_MS: process.env.NANOBOSS_SSE_KEEPALIVE_MS ?? "100",
  } as Record<string, string>;
}
