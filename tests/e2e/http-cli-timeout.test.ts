import { describe, expect, test } from "bun:test";

import {
  mockAgentEnv,
  reservePort,
  spawnNanoboss,
  waitForHealth,
  waitForMatch,
} from "./helpers.ts";

describe("HTTP CLI long-running command handling", () => {
  test("does not trip the completion timeout for moderately long runs", async () => {
    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const env = mockAgentEnv({
      NANOBOSS_HTTP_IDLE_TIMEOUT_SECONDS: "5",
      NANOBOSS_SSE_KEEPALIVE_MS: "100",
      NANOBOSS_HTTP_RUN_IDLE_TIMEOUT_MS: "1000",
      NANOBOSS_RUN_HEARTBEAT_MS: "100",
    });
    const server = spawnNanoboss(["server", "--port", String(port)], env);

    try {
      await waitForHealth(baseUrl);

      const cli = spawnNanoboss(["cli", "--server-url", baseUrl], env);
      try {
        await waitForMatch(cli.stdout, /> /);
        cli.write("/second-opinion simulate-long-run should a command timeout wait for actual completion?\n");

        await waitForMatch(cli.stdout, /Starting second-opinion workflow/);
        await waitForMatch(cli.stderr, /callAgent \[claude:opus\]/);
        await waitForMatch(cli.stdout, /> /, 20_000);

        expect(`${cli.stdout()}\n${cli.stderr()}`).not.toContain("Timed out waiting for run completion");
      } finally {
        await cli.stop();
      }
    } finally {
      await server.stop();
    }
  }, 30_000);
});
