import { expect, test } from "bun:test";

import { callAgent } from "../../src/call-agent.ts";
import { describeE2E } from "./helpers.ts";

describeE2E("callAgent passthrough (real agent)", () => {
  test(
    "returns a non-empty string response",
    async () => {
      const result = await callAgent("What is 2 + 2? Reply with just the number.");
      expect(result.data?.trim()).toBe("4");
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.raw).toBeTruthy();
      expect(result.dataRef).toBeDefined();
    },
    60_000,
  );

  test(
    "handles multi-line responses",
    async () => {
      const result = await callAgent(
        "List the first 3 prime numbers, one per line, just the numbers.",
      );
      const lines = result.data
        ?.trim()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      expect(lines).toEqual(["2", "3", "5"]);
    },
    60_000,
  );
});
