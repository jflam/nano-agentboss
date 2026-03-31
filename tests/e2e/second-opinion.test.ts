import { expect, test } from "bun:test";

import { CommandContextImpl } from "../../src/context.ts";
import { RunLogger } from "../../src/logger.ts";
import { ProcedureRegistry } from "../../src/registry.ts";
import { SessionStore } from "../../src/session-store.ts";
import type { ValueRef } from "../../src/types.ts";
import { describeE2E } from "./helpers.ts";

interface SecondOpinionData {
  subject: string;
  answer: ValueRef;
  critique: ValueRef;
  verdict: "sound" | "mixed" | "flawed";
}

describeE2E("/second-opinion (real agents)", () => {
  test(
    "returns a critique manifest and rendered display",
    async () => {
      const registry = new ProcedureRegistry();
      await registry.loadFromDisk();

      const procedure = registry.get("second-opinion");
      if (!procedure) {
        throw new Error("Missing /second-opinion procedure");
      }

      const logger = new RunLogger();
      const store = new SessionStore({
        sessionId: crypto.randomUUID(),
        cwd: process.cwd(),
      });
      const ctx = new CommandContextImpl({
        cwd: process.cwd(),
        logger,
        registry,
        procedureName: "second-opinion",
        spanId: logger.newSpan(),
        emitter: {
          emit() {},
          async flush() {},
        },
        store,
        cell: store.startCell({
          procedure: "second-opinion",
          input: "What is 2 + 2? Reply with just the number.",
          kind: "top_level",
        }),
      });

      const result = await procedure.execute(
        "What is 2 + 2? Reply with just the number.",
        ctx,
      );

      expect(typeof result).toBe("object");
      if (!result || typeof result === "string") {
        throw new Error("Expected ProcedureResult object");
      }

      expect(result.summary).toContain("second-opinion:");
      expect(result.display).toContain("Claude (opus)");
      expect(result.display).toContain("Codex critique (gpt-5.4)");
      expect(result.display).toContain("Revised answer");

      const data = result.data as SecondOpinionData | undefined;
      expect(data?.subject).toBe("What is 2 + 2? Reply with just the number.");
      expect(data?.verdict).toMatch(/sound|mixed|flawed/);
      expect(data?.answer).toBeDefined();
      expect(data?.critique).toBeDefined();
    },
    180_000,
  );
});
