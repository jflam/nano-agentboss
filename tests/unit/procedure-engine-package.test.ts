import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DownstreamAgentConfig } from "@nanoboss/contracts";
import {
  findRecoveredProcedureDispatchRun,
  procedureDispatchResultFromRecoveredRun,
  resumeProcedure,
  runProcedure,
  TopLevelProcedureCancelledError,
  waitForRecoveredProcedureDispatchRun,
} from "@nanoboss/procedure-engine";
import type {
  Procedure,
  ProcedureApi,
  ProcedureRegistryLike,
} from "@nanoboss/procedure-sdk";
import { SessionStore } from "@nanoboss/store";

const DEFAULT_AGENT_CONFIG: DownstreamAgentConfig = {
  command: "mock-agent",
  args: [],
};

function createRegistry(procedures: Procedure[]): ProcedureRegistryLike {
  const byName = new Map(procedures.map((procedure) => [procedure.name, procedure]));
  return {
    get: (name) => byName.get(name),
    register(procedure) {
      byName.set(procedure.name, procedure);
    },
    async loadProcedureFromPath() {
      throw new Error("Not implemented in test");
    },
    async persist() {
      throw new Error("Not implemented in test");
    },
    listMetadata: () => procedures.map(({ name, description, inputHint, executionMode }) => ({
      name,
      description,
      inputHint,
      executionMode,
    })),
  };
}

function createStore(name: string): SessionStore {
  const rootDir = mkdtempSync(join(tmpdir(), `${name}-`));
  return new SessionStore({
    sessionId: crypto.randomUUID(),
    cwd: rootDir,
    rootDir,
  });
}

function createEmitter() {
  return {
    emit(_update: unknown) {},
    emitUiEvent(_event: unknown) {},
    async flush() {},
  };
}

function buildRunParams(
  store: SessionStore,
  registry: ProcedureRegistryLike,
  procedure: Procedure,
  prompt: string,
): Parameters<typeof runProcedure>[0] {
  return {
    cwd: store.cwd,
    sessionId: store.sessionId,
    store,
    registry,
    procedure,
    prompt,
    emitter: createEmitter(),
    getDefaultAgentConfig: () => DEFAULT_AGENT_CONFIG,
    setDefaultAgentSelection: () => DEFAULT_AGENT_CONFIG,
  };
}

describe("procedure-engine package", () => {
  test("runs top-level procedures and records child procedure runs via the package boundary", async () => {
    const store = createStore("nab-procedure-engine-child");
    const child: Procedure = {
      name: "child",
      description: "Nested child procedure",
      async execute() {
        return {
          data: { value: "child-result" },
          summary: "child summary",
        };
      },
    };
    const parent: Procedure = {
      name: "parent",
      description: "Parent procedure",
      async execute(_prompt: string, ctx: ProcedureApi) {
        const childResult = await ctx.procedures.run<{ value: string }>("child", "nested prompt");
        return {
          data: {
            childRunId: childResult.run.runId,
            childValue: childResult.data?.value,
          },
          summary: `parent in ${ctx.sessionId}`,
        };
      },
    };
    const registry = createRegistry([parent, child]);

    const result = await runProcedure(buildRunParams(store, registry, parent, "run parent"));

    expect(result.summary).toBe(`parent in ${store.sessionId}`);
    const descendants = store.getRunDescendants(result.run, { maxDepth: 1 });
    expect(descendants).toHaveLength(1);
    const childDescendant = descendants[0];
    expect(childDescendant?.procedure).toBe("child");
    if (!childDescendant) {
      throw new Error("expected child descendant");
    }
    const childRun = store.getRun(childDescendant.run);
    expect(childRun.output.data).toEqual({ value: "child-result" });
  });

  test("supports pause and resume through the package boundary", async () => {
    const store = createStore("nab-procedure-engine-resume");
    const pauseable: Procedure = {
      name: "pauseable",
      description: "Pauseable procedure",
      async execute() {
        return {
          display: "paused\n",
          pause: {
            question: "Continue?",
            state: { step: 1 },
          },
        };
      },
      async resume(prompt, state) {
        return {
          display: `resumed: ${prompt}\n`,
          summary: `step ${(state as { step: number }).step}`,
        };
      },
    };
    const registry = createRegistry([pauseable]);

    const paused = await runProcedure(buildRunParams(store, registry, pauseable, "start"));
    expect(paused.pause?.question).toBe("Continue?");
    if (!paused.pause) {
      throw new Error("expected paused procedure state");
    }

    const resumed = await resumeProcedure({
      ...buildRunParams(store, registry, pauseable, "ship it"),
      state: paused.pause.state,
    });

    expect(resumed.pause).toBeUndefined();
    expect(resumed.display).toBe("resumed: ship it\n");
    expect(resumed.summary).toBe("step 1");
  });

  test("finds and rehydrates recovered dispatch runs through the package boundary", async () => {
    const store = createStore("nab-procedure-engine-recovery");
    const recoverable: Procedure = {
      name: "recoverable",
      description: "Recoverable procedure",
      async execute() {
        return {
          display: "done\n",
          summary: "recovered summary",
        };
      },
    };
    const registry = createRegistry([recoverable]);
    const result = await runProcedure({
      ...buildRunParams(store, registry, recoverable, "recover me"),
      dispatchCorrelationId: "corr-recovery",
    });

    const recovered = findRecoveredProcedureDispatchRun(store, {
      procedureName: recoverable.name,
      dispatchCorrelationId: "corr-recovery",
    });
    expect(recovered?.run).toEqual(result.run);

    const waited = await waitForRecoveredProcedureDispatchRun(store, {
      procedureName: recoverable.name,
      dispatchCorrelationId: "corr-recovery",
    });
    expect(waited?.run).toEqual(result.run);
    if (!waited) {
      throw new Error("expected recovered dispatch run");
    }
    expect(procedureDispatchResultFromRecoveredRun(waited).summary).toBe("recovered summary");
  });

  test("enforces cancellation boundaries through the package boundary", async () => {
    const store = createStore("nab-procedure-engine-cancel");
    const cancellable: Procedure = {
      name: "cancellable",
      description: "Cancellable procedure",
      async execute(_prompt, ctx) {
        ctx.assertNotCancelled();
        return {
          display: "should not finish\n",
        };
      },
    };
    const registry = createRegistry([cancellable]);
    const controller = new AbortController();
    controller.abort();

    await expect(runProcedure({
      ...buildRunParams(store, registry, cancellable, "stop"),
      softStopSignal: controller.signal,
    })).rejects.toBeInstanceOf(TopLevelProcedureCancelledError);
  });
});
