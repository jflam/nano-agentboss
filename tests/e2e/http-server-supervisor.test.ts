import { describe, expect, test } from "bun:test";

import { getServerHealth, requestServerShutdown } from "../../src/http/client.ts";
import { ensureMatchingHttpServer } from "../../src/http/server-supervisor.ts";
import { reservePort } from "./helpers.ts";

describe("HTTP server supervisor", () => {
  test("starts the local background server when missing", async () => {
    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    await ensureMatchingHttpServer(baseUrl, {
      cwd: process.cwd(),
    });

    try {
      const health = await getServerHealth(baseUrl);
      expect(health.status).toBe("ok");
      expect(health.buildCommit).toBeTruthy();
    } finally {
      await requestServerShutdown(baseUrl);
      await waitForShutdown(baseUrl);
    }
  }, 20_000);
});

async function waitForShutdown(baseUrl: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await getServerHealth(baseUrl);
    } catch {
      return;
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for shutdown at ${baseUrl}`);
    }

    await Bun.sleep(100);
  }
}
