import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "bun:test";

import { writePersistedDefaultAgentSelection } from "@nanoboss/store";
import { resolveDownstreamAgentConfig } from "@nanoboss/procedure-engine";

let tempHome: string | undefined;

afterEach(() => {
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
    tempHome = undefined;
  }
});

test("resolveDownstreamAgentConfig delegates explicit selections to agent-acp", () => {
  const config = resolveDownstreamAgentConfig("/repo", {
    provider: "claude",
    model: "opus",
  });

  expect(config.provider).toBe("claude");
  expect(config.command).toBe("claude-code-acp");
  expect(config.args).toEqual([]);
  expect(config.cwd).toBe("/repo");
  expect(config.model).toBe("opus");
  expect(config.env).toEqual({
    ANTHROPIC_API_KEY: "",
    CLAUDE_API_KEY: "",
  });
});

test("resolveDownstreamAgentConfig still supports raw env overrides", () => {
  const originalCommand = process.env.NANOBOSS_AGENT_CMD;
  const originalArgs = process.env.NANOBOSS_AGENT_ARGS;
  const originalModel = process.env.NANOBOSS_AGENT_MODEL;

  process.env.NANOBOSS_AGENT_CMD = "custom-agent";
  process.env.NANOBOSS_AGENT_ARGS = "[\"--foo\",\"bar\"]";
  delete process.env.NANOBOSS_AGENT_MODEL;

  try {
    const config = resolveDownstreamAgentConfig("/repo");

    expect(config.command).toBe("custom-agent");
    expect(config.args).toEqual(["--foo", "bar"]);
    expect(config.cwd).toBe("/repo");
    expect(config.provider).toBeUndefined();
    expect(config.model).toBeUndefined();
  } finally {
    restoreEnv("NANOBOSS_AGENT_CMD", originalCommand);
    restoreEnv("NANOBOSS_AGENT_ARGS", originalArgs);
    restoreEnv("NANOBOSS_AGENT_MODEL", originalModel);
  }
});

test("resolveDownstreamAgentConfig reads default model from env for known providers", () => {
  const originalCommand = process.env.NANOBOSS_AGENT_CMD;
  const originalArgs = process.env.NANOBOSS_AGENT_ARGS;
  const originalModel = process.env.NANOBOSS_AGENT_MODEL;

  process.env.NANOBOSS_AGENT_CMD = "copilot";
  process.env.NANOBOSS_AGENT_ARGS = "[\"--acp\",\"--allow-all-tools\"]";
  process.env.NANOBOSS_AGENT_MODEL = "gpt-5.4/xhigh";

  try {
    const config = resolveDownstreamAgentConfig("/repo");

    expect(config.provider).toBe("copilot");
    expect(config.command).toBe("copilot");
    expect(config.model).toBe("gpt-5.4");
  } finally {
    restoreEnv("NANOBOSS_AGENT_CMD", originalCommand);
    restoreEnv("NANOBOSS_AGENT_ARGS", originalArgs);
    restoreEnv("NANOBOSS_AGENT_MODEL", originalModel);
  }
});

test("resolveDownstreamAgentConfig uses the persisted default agent selection when no env override is present", () => {
  const originalHome = process.env.HOME;
  const originalCommand = process.env.NANOBOSS_AGENT_CMD;
  const originalArgs = process.env.NANOBOSS_AGENT_ARGS;
  const originalModel = process.env.NANOBOSS_AGENT_MODEL;

  tempHome = mkdtempSync(join(tmpdir(), "nanoboss-config-"));
  process.env.HOME = tempHome;
  delete process.env.NANOBOSS_AGENT_CMD;
  delete process.env.NANOBOSS_AGENT_ARGS;
  delete process.env.NANOBOSS_AGENT_MODEL;
  writePersistedDefaultAgentSelection({
    provider: "codex",
    model: "gpt-5.2/high",
  });

  try {
    const config = resolveDownstreamAgentConfig("/repo");

    expect(config.provider).toBe("codex");
    expect(config.command).toBe("codex-acp");
    expect(config.model).toBe("gpt-5.2/high");
  } finally {
    restoreEnv("HOME", originalHome);
    restoreEnv("NANOBOSS_AGENT_CMD", originalCommand);
    restoreEnv("NANOBOSS_AGENT_ARGS", originalArgs);
    restoreEnv("NANOBOSS_AGENT_MODEL", originalModel);
  }
});

test("explicit env overrides beat the persisted default agent selection", () => {
  const originalHome = process.env.HOME;
  const originalCommand = process.env.NANOBOSS_AGENT_CMD;
  const originalArgs = process.env.NANOBOSS_AGENT_ARGS;
  const originalModel = process.env.NANOBOSS_AGENT_MODEL;

  tempHome = mkdtempSync(join(tmpdir(), "nanoboss-config-"));
  process.env.HOME = tempHome;
  writePersistedDefaultAgentSelection({
    provider: "codex",
    model: "gpt-5.2/high",
  });
  process.env.NANOBOSS_AGENT_CMD = "copilot";
  process.env.NANOBOSS_AGENT_ARGS = "[\"--acp\",\"--allow-all-tools\"]";
  process.env.NANOBOSS_AGENT_MODEL = "gpt-5.4/xhigh";

  try {
    const config = resolveDownstreamAgentConfig("/repo");

    expect(config.provider).toBe("copilot");
    expect(config.command).toBe("copilot");
    expect(config.model).toBe("gpt-5.4");
  } finally {
    restoreEnv("HOME", originalHome);
    restoreEnv("NANOBOSS_AGENT_CMD", originalCommand);
    restoreEnv("NANOBOSS_AGENT_ARGS", originalArgs);
    restoreEnv("NANOBOSS_AGENT_MODEL", originalModel);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
    return;
  }

  process.env[key] = value;
}
