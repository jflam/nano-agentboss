import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DefaultConversationSession } from "../../src/agent/default-session.ts";
import { ProcedureRegistry } from "../../src/procedure/registry.ts";
import { NanobossService } from "../../src/core/service.ts";
import type { DownstreamAgentConfig } from "../../src/core/types.ts";

function createMockConfig(
  cwd: string,
  options: {
    supportLoadSession: boolean;
    sessionStoreDir: string;
  },
): DownstreamAgentConfig {
  return {
    command: "bun",
    args: ["run", "tests/fixtures/mock-agent.ts"],
    cwd,
    env: {
      MOCK_AGENT_SUPPORT_LOAD_SESSION: options.supportLoadSession ? "1" : "0",
      MOCK_AGENT_SESSION_STORE_DIR: options.sessionStoreDir,
    },
  };
}

describe("/default native session continuity", () => {
  test(
    "first prompt persists an ACP session id and second prompt reuses the live session",
    async () => {
      const sessionStoreDir = mkdtempSync(join(tmpdir(), "nab-default-live-"));
      const conversation = new DefaultConversationSession({
        config: createMockConfig(process.cwd(), {
          supportLoadSession: true,
          sessionStoreDir,
        }),
        sessionId: crypto.randomUUID(),
      });

      try {
        const first = await conversation.prompt("what is 2+2");
        expect(first.raw).toBe("4");
        const acpSessionId = conversation.currentSessionId;
        expect(acpSessionId).toBeTruthy();

        const second = await conversation.prompt("add 3 to result");
        expect(second.raw).toBe("7");
        expect(conversation.currentSessionId).toBe(acpSessionId);
      } finally {
        conversation.closeLiveSession();
      }
    },
    30_000,
  );

  test(
    "falls back to session/load when the live session is gone",
    async () => {
      const sessionStoreDir = mkdtempSync(join(tmpdir(), "nab-default-load-"));
      const conversation = new DefaultConversationSession({
        config: createMockConfig(process.cwd(), {
          supportLoadSession: true,
          sessionStoreDir,
        }),
        sessionId: crypto.randomUUID(),
      });

      try {
        await conversation.prompt("what is 2+2");
        const acpSessionId = conversation.currentSessionId;
        expect(acpSessionId).toBeTruthy();

        conversation.closeLiveSession();

        const second = await conversation.prompt("add 3 to result");
        expect(second.raw).toBe("7");
        expect(conversation.currentSessionId).toBe(acpSessionId);
      } finally {
        conversation.closeLiveSession();
      }
    },
    30_000,
  );

  test(
    "starts fresh when native resume is unavailable",
    async () => {
      const sessionStoreDir = mkdtempSync(join(tmpdir(), "nab-default-fresh-"));
      const conversation = new DefaultConversationSession({
        config: createMockConfig(process.cwd(), {
          supportLoadSession: false,
          sessionStoreDir,
        }),
        sessionId: crypto.randomUUID(),
      });

      try {
        await conversation.prompt("what is 2+2");
        const firstSessionId = conversation.currentSessionId;
        expect(firstSessionId).toBeTruthy();

        conversation.closeLiveSession();

        const second = await conversation.prompt("add 3 to result");
        expect(second.raw).toBe("no prior result");
        expect(conversation.currentSessionId).toBeTruthy();
        expect(conversation.currentSessionId).not.toBe(firstSessionId);
      } finally {
        conversation.closeLiveSession();
      }
    },
    30_000,
  );

  test(
    "changing the default agent config resets native session continuity",
    async () => {
      const sessionStoreDir = mkdtempSync(join(tmpdir(), "nab-default-reset-"));
      const conversation = new DefaultConversationSession({
        config: createMockConfig(process.cwd(), {
          supportLoadSession: true,
          sessionStoreDir,
        }),
        sessionId: crypto.randomUUID(),
      });

      try {
        await conversation.prompt("what is 2+2");
        const firstSessionId = conversation.currentSessionId;
        expect(firstSessionId).toBeTruthy();

        conversation.updateConfig({
          ...createMockConfig(process.cwd(), {
            supportLoadSession: true,
            sessionStoreDir,
          }),
          provider: "claude",
        });

        expect(conversation.currentSessionId).toBeUndefined();

        const second = await conversation.prompt("add 3 to result");
        expect(second.raw).toBe("no prior result");
        expect(conversation.currentSessionId).toBeTruthy();
        expect(conversation.currentSessionId).not.toBe(firstSessionId);
      } finally {
        conversation.closeLiveSession();
      }
    },
    30_000,
  );

  test(
    "the built-in /default command is conversational across turns",
    async () => {
      const registry = new ProcedureRegistry(mkdtempSync(join(tmpdir(), "nab-default-registry-")));
      registry.loadBuiltins();

      const sessionStoreDir = mkdtempSync(join(tmpdir(), "nab-default-service-"));
      const service = new NanobossService(
        registry,
        (cwd) => createMockConfig(cwd, {
          supportLoadSession: true,
          sessionStoreDir,
        }),
      );
      const session = service.createSession({ cwd: process.cwd() });

      try {
        await service.prompt(session.sessionId, "what is 2+2");
        await service.prompt(session.sessionId, "add 3 to result");

        const completed = (service.getSessionEvents(session.sessionId)?.after(-1) ?? [])
          .filter((event) => event.type === "run_completed");

        expect(completed).toHaveLength(2);
        expect(completed[0]?.data.display).toBe("4");
        expect(completed[1]?.data.display).toBe("7");
      } finally {
        service.destroySession(session.sessionId);
      }
    },
    30_000,
  );

  test(
    "service resume restores native default-session continuity after a restart",
    async () => {
      const previousHome = process.env.HOME;
      process.env.HOME = mkdtempSync(join(tmpdir(), "nab-default-resume-home-"));

      try {
        const registry = new ProcedureRegistry(mkdtempSync(join(tmpdir(), "nab-default-resume-registry-")));
        registry.loadBuiltins();

        const sessionStoreDir = mkdtempSync(join(tmpdir(), "nab-default-resume-agent-"));
        const createService = () => new NanobossService(
          registry,
          (cwd) => createMockConfig(cwd, {
            supportLoadSession: true,
            sessionStoreDir,
          }),
        );

        const service = createService();
        const session = service.createSession({ cwd: process.cwd() });

        try {
          await service.prompt(session.sessionId, "what is 2+2");
        } finally {
          service.destroySession(session.sessionId);
        }

        const resumedService = createService();
        const resumed = resumedService.resumeSession({
          sessionId: session.sessionId,
          cwd: process.cwd(),
        });

        try {
          await resumedService.prompt(resumed.sessionId, "add 3 to result");

          const completed = (resumedService.getSessionEvents(resumed.sessionId)?.after(-1) ?? [])
            .filter((event) => event.type === "run_completed");

          expect(completed).toHaveLength(1);
          expect(completed[0]?.data.display).toBe("7");
        } finally {
          resumedService.destroySession(resumed.sessionId);
        }
      } finally {
        if (previousHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = previousHome;
        }
      }
    },
    30_000,
  );
});
