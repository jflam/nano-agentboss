import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProcedureRegistry } from "../../src/registry.ts";
import { NanoAgentBossService } from "../../src/service.ts";

describe("NanoAgentBossService", () => {
  test("does not duplicate final display when the same text was already streamed", async () => {
    const registry = new ProcedureRegistry(mkdtempSync(join(tmpdir(), "nab-service-")));
    registry.register({
      name: "default",
      description: "test default",
      async execute(_prompt, ctx) {
        ctx.print("4");
        return {
          display: "4",
        };
      },
    });

    const service = new NanoAgentBossService(registry);
    const session = service.createSession({ cwd: process.cwd() });

    await service.prompt(session.sessionId, "what is 2+2");

    const events = service.getSessionEvents(session.sessionId)?.after(-1) ?? [];
    const textEvents = events.filter((event) => event.type === "text_delta");

    expect(textEvents).toHaveLength(1);
    expect(textEvents[0]?.data.text).toBe("4");
  });

  test("/model updates the session default agent banner", async () => {
    const registry = new ProcedureRegistry(mkdtempSync(join(tmpdir(), "nab-service-")));
    registry.loadBuiltins();

    const service = new NanoAgentBossService(registry);
    const session = service.createSession({ cwd: process.cwd() });

    await service.prompt(session.sessionId, "/model copilot gpt-5.4/xhigh");

    expect(service.getSession(session.sessionId)?.agentLabel).toBe("copilot/gpt-5.4/x-high");
  });

  test("createSession accepts an inherited default agent selection", () => {
    const registry = new ProcedureRegistry(mkdtempSync(join(tmpdir(), "nab-service-")));
    registry.loadBuiltins();

    const service = new NanoAgentBossService(registry);
    const session = service.createSession({
      cwd: process.cwd(),
      defaultAgentSelection: {
        provider: "copilot",
        model: "gpt-5.4/xhigh",
      },
    });

    expect(session.agentLabel).toBe("copilot/gpt-5.4/x-high");
    expect(session.defaultAgentSelection).toEqual({
      provider: "copilot",
      model: "gpt-5.4/xhigh",
    });
  });
});
