import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReasoningModelSelection,
  discoverAgentCatalog,
  findSelectableModelOption,
  isKnownAgentProvider,
  isKnownModelSelection,
  listKnownProviders,
  listSelectableModelOptions,
  parseReasoningModelSelection,
} from "@nanoboss/agent-acp";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DISCOVERY_MOCK_AGENT_PATH = fileURLToPath(
  new URL("../../../tests/fixtures/catalog-discovery-mock-agent.ts", import.meta.url),
);
const originalHome = process.env.HOME;
const testHome = mkdtempSync(join(tmpdir(), "nanoboss-model-catalog-home-"));

interface DiscoveryLogEvent {
  kind: string;
  sessionId: string;
  configId?: string;
  value?: string;
}

process.env.HOME = testHome;
process.on("exit", () => {
  try {
    rmSync(testHome, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures during test shutdown.
  }

  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

async function discoverMockCatalog(provider: "copilot" | "codex" | "claude" | "gemini"): Promise<{
  catalog: Awaited<ReturnType<typeof discoverAgentCatalog>>;
  events: DiscoveryLogEvent[];
}> {
  const logDir = mkdtempSync(join(tmpdir(), `nanoboss-model-discovery-${provider}-`));
  const logPath = join(logDir, "events.jsonl");

  try {
    const catalog = await discoverAgentCatalog(provider, {
      config: {
        command: "bun",
        args: ["run", DISCOVERY_MOCK_AGENT_PATH],
        cwd: REPO_ROOT,
        env: {
          DISCOVERY_AGENT_LOG: logPath,
          DISCOVERY_AGENT_PROVIDER: provider,
        },
      },
    });

    const logText = readFileSync(logPath, "utf8").trim();
    return {
      catalog,
      events: logText
        ? logText.split("\n").map((line) => JSON.parse(line) as DiscoveryLogEvent)
        : [],
    };
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
}

test("lists the known downstream agents", () => {
  expect(listKnownProviders()).toEqual(["claude", "gemini", "codex", "copilot"]);
  expect(isKnownAgentProvider("copilot")).toBe(true);
  expect(isKnownAgentProvider("not-real")).toBe(false);
});

test("expands copilot reasoning variants into selectable options", () => {
  const options = listSelectableModelOptions("copilot");

  expect(options.some((option) => option.value === "gpt-5.4/low")).toBe(true);
  expect(options.some((option) => option.value === "gpt-5.4/medium")).toBe(true);
  expect(options.some((option) => option.value === "gpt-5.4/high")).toBe(true);
  expect(options.some((option) => option.value === "gpt-5.4/xhigh")).toBe(true);
  expect(options.find((option) => option.value === "gpt-5.4/medium")?.label).toContain("default");
});

test("accepts both explicit and implicit copilot reasoning selections", () => {
  expect(isKnownModelSelection("copilot", "gpt-5.4")).toBe(true);
  expect(isKnownModelSelection("copilot", "gpt-5.4/xhigh")).toBe(true);
  expect(isKnownModelSelection("copilot", "gpt-5.4-mini/xhigh")).toBe(true);
  expect(isKnownModelSelection("copilot", "claude-opus-4.6-1m/high")).toBe(true);
  expect(isKnownModelSelection("copilot", "gpt-5.4/not-real")).toBe(false);
  expect(isKnownModelSelection("copilot", "claude-opus-4.6-fast")).toBe(false);
});

test("matches the current Copilot ACP model ids", () => {
  const options = listSelectableModelOptions("copilot");

  expect(options.some((option) => option.value === "gpt-5.4-mini/xhigh")).toBe(true);
  expect(options.some((option) => option.value === "claude-opus-4.6-1m/medium")).toBe(true);
  expect(options.some((option) => option.value === "goldeneye/medium")).toBe(true);
  expect(options.some((option) => option.value === "claude-opus-4.6-fast")).toBe(false);
  expect(options.some((option) => option.value === "gpt-5.1-codex-max")).toBe(false);
});

test("keeps codex slash model ids intact", () => {
  const options = listSelectableModelOptions("codex");

  expect(options.some((option) => option.value === "gpt-5.4/high")).toBe(true);
  expect(options.some((option) => option.value === "gpt-5.4/xhigh")).toBe(true);
  expect(isKnownModelSelection("codex", "gpt-5.2-codex/xhigh")).toBe(true);
  expect(isKnownModelSelection("codex", "gpt-5.4/high")).toBe(true);
  expect(findSelectableModelOption("codex", "gpt-5.4/high")?.label).toContain("gpt-5.4");
  expect(findSelectableModelOption("codex", "gpt-5.2-codex/xhigh")?.label).toContain("Extra High");
});

test("shared reasoning helpers parse and rebuild known effort suffixes", () => {
  expect(parseReasoningModelSelection("gpt-5.4/xhigh")).toEqual({
    baseModel: "gpt-5.4",
    reasoningEffort: "xhigh",
  });
  expect(buildReasoningModelSelection("gpt-5.4", "xhigh")).toBe("gpt-5.4/xhigh");
  expect(parseReasoningModelSelection("gpt-5.2-codex/xhigh")).toEqual({
    baseModel: "gpt-5.2-codex",
    reasoningEffort: "xhigh",
  });
  expect(parseReasoningModelSelection("gemini-2.5-pro")).toEqual({
    baseModel: "gemini-2.5-pro",
  });
});

test("requires canonical gemini model ids", () => {
  expect(isKnownModelSelection("gemini", "gemini-2.5-pro")).toBe(true);
  expect(isKnownModelSelection("gemini", "pro")).toBe(false);
  expect(findSelectableModelOption("gemini", "flash")).toBeUndefined();
});

test("discovers and normalizes Copilot model-specific reasoning metadata", async () => {
  const { catalog, events } = await discoverMockCatalog("copilot");

  expect(catalog).toEqual({
    provider: "copilot",
    label: "Copilot",
    models: [
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
        description: "Fast chat model",
      },
      {
        id: "gpt-5.4",
        name: "GPT-5.4",
        description: "Primary frontier model",
        supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
        defaultReasoningEffort: "medium",
      },
      {
        id: "claude-opus-4.7",
        name: "Claude Opus 4.7",
        description: "Premium reasoning model",
        supportedReasoningEfforts: ["low", "medium", "high"],
        defaultReasoningEffort: "high",
      },
    ],
  });
  expect(events.map((event) => event.kind)).toEqual([
    "new_session",
    "set_config",
    "set_config",
    "set_config",
    "close_session",
  ]);
  expect(events.filter((event) => event.kind === "set_config").map((event) => event.value)).toEqual([
    "gpt-4.1",
    "gpt-5.4",
    "claude-opus-4.7",
  ]);
  expect(events[0]?.sessionId).toBe(events.at(-1)?.sessionId);
});

test("collapses Codex slash-form model selectors into base catalog entries", async () => {
  const { catalog } = await discoverMockCatalog("codex");

  expect(catalog).toEqual({
    provider: "codex",
    label: "Codex",
    models: [
      {
        id: "gpt-5.4",
        name: "GPT-5.4",
        description: "Latest frontier model",
        supportedReasoningEfforts: ["medium", "high", "xhigh"],
        defaultReasoningEffort: "medium",
      },
      {
        id: "gpt-5.2-codex",
        name: "GPT-5.2 Codex",
        description: "Latest frontier agentic coding model. Balances speed and reasoning depth for everyday tasks",
        supportedReasoningEfforts: ["low", "medium", "high"],
        defaultReasoningEffort: "medium",
      },
    ],
  });
  expect(catalog.models.some((model) => model.id.includes("/"))).toBe(false);
});

test("passes Claude catalog models through without synthesizing hidden entries", async () => {
  const { catalog } = await discoverMockCatalog("claude");

  expect(catalog).toEqual({
    provider: "claude",
    label: "Claude",
    models: [
      {
        id: "default",
        name: "Default",
        description: "Account-dependent default model",
      },
      {
        id: "sonnet",
        name: "Sonnet",
        description: "Everyday Claude model",
      },
      {
        id: "auto",
        name: "Auto",
        description: "Let Claude choose",
      },
    ],
  });
  expect(catalog.models.some((model) => model.id === "opusplan")).toBe(false);
});

test("passes Gemini catalog models through and preserves advertised auto selectors", async () => {
  const { catalog } = await discoverMockCatalog("gemini");

  expect(catalog).toEqual({
    provider: "gemini",
    label: "Gemini",
    models: [
      {
        id: "auto",
        name: "Auto",
        description: "Let Gemini choose",
      },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ],
  });
  expect(catalog.models.some((model) => model.id === "gemini-3-pro-preview")).toBe(false);
});

test("keeps the model catalog owned by the public agent-acp package", () => {
  for (const path of [
    "src/agent/model-catalog.ts",
    "packages/adapters-tui/src/model-catalog.ts",
    "procedures/lib/model-catalog.ts",
  ]) {
    expect(existsSync(join(REPO_ROOT, path))).toBe(false);
  }

  for (const path of [
    "packages/adapters-tui/src/agent-label.ts",
    "packages/adapters-tui/src/app.ts",
    "packages/adapters-tui/src/commands.ts",
    "packages/procedure-engine/src/agent-config.ts",
    "procedures/model.ts",
  ]) {
    const source = readFileSync(join(REPO_ROOT, path), "utf8");
    expect(source).toContain('from "@nanoboss/agent-acp"');
    expect(source).not.toMatch(/from ["'][^"']*model-catalog(?:\.ts)?["']/);
  }
});
