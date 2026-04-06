import { describe, expect, test } from "bun:test";

import { getServerHealth } from "../../src/http/client.ts";
import { startPrivateHttpServer } from "../../src/http/private-server.ts";

describe("private HTTP server launcher", () => {
  test("starts an owned private loopback server and stops it cleanly", async () => {
    const server = await startPrivateHttpServer({
      cwd: process.cwd(),
    });

    try {
      const health = await getServerHealth(server.baseUrl);
      expect(health.status).toBe("ok");
      expect(health.buildCommit).toBeTruthy();
      expect(health.mode).toBe("private");
      expect(health.cwd).toBe(process.cwd());
      expect(new URL(server.baseUrl).hostname).toBe("127.0.0.1");
    } finally {
      await server.stop();
    }

    await expect(getServerHealth(server.baseUrl)).rejects.toThrow();
  }, 20_000);
});
