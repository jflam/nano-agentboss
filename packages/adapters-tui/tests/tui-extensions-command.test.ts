import { describe, expect, test } from "bun:test";

import type {
  TuiExtension,
} from "@nanoboss/tui-extension-sdk";
import { TuiExtensionRegistry } from "@nanoboss/tui-extension-catalog";

import {
  bootExtensions,
  formatExtensionsList,
  NanobossTuiController,
  type NanobossTuiControllerDeps,
  type PanelRenderer,
} from "@nanoboss/adapters-tui";
import type { TypeDescriptor } from "@nanoboss/procedure-sdk";

function makeRegistry(): TuiExtensionRegistry {
  return new TuiExtensionRegistry({
    cwd: "/tmp/nonexistent-extensions-command",
    extensionRoots: [],
  });
}

const STUB_SCHEMA: TypeDescriptor<Record<string, unknown>> = {
  schema: {},
  validate: (input): input is Record<string, unknown> =>
    typeof input === "object" && input !== null,
};

async function makeController(
  overrides: Partial<NanobossTuiControllerDeps> = {},
): Promise<{
  controller: NanobossTuiController;
  statuses: string[];
}> {
  const statuses: string[] = [];
  const controller = new NanobossTuiController(
    {
      serverUrl: "http://127.0.0.1:0",
      showToolCalls: false,
    },
    {
      onStateChange: (state) => {
        if (state.statusLine) statuses.push(state.statusLine);
      },
      onClearInput: () => {},
      ...overrides,
    },
  );
  return { controller, statuses };
}

describe("/extensions slash command", () => {
  test("lists a fixture extension with correct scope, status=active, and non-zero contribution counts", async () => {
    const registry = makeRegistry();
    const fixture: TuiExtension = {
      metadata: {
        name: "extcmd-active",
        version: "1.2.3",
        description: "fixture for /extensions active case",
      },
      activate(ctx) {
        ctx.registerKeyBinding({
          id: "ping",
          category: "custom",
          label: "extcmd ping",
          match: (data) => data === "\u0001extcmd-active-ping\u0001",
          run() { return { consume: true }; },
        });
        ctx.registerChromeContribution({
          id: "badge",
          slot: "footer",
          render: () => ({ __extcmd: true } as unknown as never),
        });
        const renderer: PanelRenderer<Record<string, unknown>> = {
          rendererId: "extcmd-active/unique@1",
          schema: STUB_SCHEMA,
          render({ payload }) { return payload as unknown as never; },
        };
        ctx.registerPanelRenderer(renderer);
      },
    };
    registry.registerBuiltinExtension(fixture);

    const result = await bootExtensions("/tmp/nonexistent-extensions-command", {
      registry,
      log: () => {},
    });

    const entries = result.registry.listMetadata();
    const entry = entries.find((e) => e.metadata.name === "extcmd-active");
    expect(entry).toBeDefined();
    expect(entry?.scope).toBe("builtin");
    expect(entry?.status).toBe("active");
    expect(entry?.contributions).toEqual({
      bindings: 1,
      chromeContributions: 1,
      activityBarSegments: 0,
      panelRenderers: 1,
    });

    // Controller dispatch produces a readable status line per extension,
    // and the active extension's line reflects its registered counts.
    const { controller, statuses } = await makeController({
      listExtensionEntries: () => result.registry.listMetadata(),
    });
    await controller.handleSubmit("/extensions");

    const activeLine = statuses.find((line) => line.includes("extcmd-active"));
    expect(activeLine).toBeDefined();
    expect(activeLine).toContain("[builtin]");
    expect(activeLine).toContain("active");
    expect(activeLine).toContain("bindings=1");
    expect(activeLine).toContain("chrome=1");
    expect(activeLine).toContain("panels=1");
  });

  test("lists a failed extension with status=failed and the captured error message", async () => {
    const registry = makeRegistry();
    const broken: TuiExtension = {
      metadata: {
        name: "extcmd-broken",
        version: "0.0.1",
        description: "throws during activate",
      },
      activate() {
        throw new Error("activate kaboom");
      },
    };
    registry.registerBuiltinExtension(broken);

    const result = await bootExtensions("/tmp/nonexistent-extensions-command", {
      registry,
      log: () => {},
    });

    const entry = result.registry.listMetadata().find((e) => e.metadata.name === "extcmd-broken");
    expect(entry?.status).toBe("failed");
    expect(entry?.error?.message).toBe("activate kaboom");

    // formatExtensionsList is the direct formatter behind the slash
    // command; asserting on it keeps the test resilient to unrelated
    // status-line noise that might appear before the command line fires.
    const lines = formatExtensionsList(result.registry.listMetadata());
    const failedLine = lines.find((line) => line.includes("extcmd-broken"));
    expect(failedLine).toBeDefined();
    expect(failedLine).toContain("failed");
    expect(failedLine).toContain("error=activate kaboom");
  });

  test("formatExtensionsList falls back to a single summary line when the registry is empty", () => {
    expect(formatExtensionsList([])).toEqual(["[extensions] no extensions loaded"]);
  });

  test("aggregate failure status is emitted via bootExtensions.aggregateStatus when >=1 extension fails", async () => {
    const registry = makeRegistry();
    registry.registerBuiltinExtension({
      metadata: { name: "extcmd-ok", version: "1.0.0", description: "ok" },
      activate() {},
    });
    registry.registerBuiltinExtension({
      metadata: { name: "extcmd-bad", version: "1.0.0", description: "bad" },
      activate() { throw new Error("nope"); },
    });

    const logs: { level: string; text: string }[] = [];
    const result = await bootExtensions("/tmp/nonexistent-extensions-command", {
      registry,
      log: (level, text) => logs.push({ level, text }),
    });

    expect(result.failedCount).toBe(1);
    expect(result.aggregateStatus).toBe("[extensions] 1 extension failed to activate");
    const aggregate = logs.find((entry) => entry.text === result.aggregateStatus);
    expect(aggregate?.level).toBe("error");
  });

  test("aggregate failure status is NOT emitted when every extension activates cleanly", async () => {
    const registry = makeRegistry();
    registry.registerBuiltinExtension({
      metadata: { name: "extcmd-ok1", version: "1.0.0", description: "ok1" },
      activate() {},
    });
    registry.registerBuiltinExtension({
      metadata: { name: "extcmd-ok2", version: "1.0.0", description: "ok2" },
      activate() {},
    });

    const logs: { level: string; text: string }[] = [];
    const result = await bootExtensions("/tmp/nonexistent-extensions-command", {
      registry,
      log: (level, text) => logs.push({ level, text }),
    });

    expect(result.failedCount).toBe(0);
    expect(result.aggregateStatus).toBeUndefined();
    const aggregateHit = logs.find((entry) => entry.text.includes("failed to activate"));
    expect(aggregateHit).toBeUndefined();
  });
});
