import { expect, test } from "bun:test";

import {
  resolveDefaultDownstreamAgentConfig,
  resolveSelectedDownstreamAgentConfig,
  toDownstreamAgentSelection,
} from "@nanoboss/agent-acp";

test("resolveSelectedDownstreamAgentConfig maps claude selections to the ACP adapter", () => {
  const config = resolveSelectedDownstreamAgentConfig(
    {
      provider: "claude",
      model: "opus",
    },
    "/repo",
  );

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

test("resolveSelectedDownstreamAgentConfig round-trips copilot reasoning selections", () => {
  const config = resolveSelectedDownstreamAgentConfig(
    {
      provider: "copilot",
      model: "gpt-5.4/xhigh",
    },
    "/repo",
  );

  expect(config.provider).toBe("copilot");
  expect(config.command).toBe("copilot");
  expect(config.args).toEqual(["--acp", "--allow-all-tools"]);
  expect(config.cwd).toBe("/repo");
  expect(config.model).toBe("gpt-5.4");
  expect(config.reasoningEffort).toBe("xhigh");
  expect(toDownstreamAgentSelection(config)).toEqual({
    provider: "copilot",
    model: "gpt-5.4/xhigh",
  });
});

test("resolveSelectedDownstreamAgentConfig keeps slash model ids intact for non-copilot providers", () => {
  const config = resolveSelectedDownstreamAgentConfig(
    {
      provider: "codex",
      model: "gpt-5.4/xhigh",
    },
    "/repo",
  );

  expect(config.provider).toBe("codex");
  expect(config.command).toBe("codex-acp");
  expect(config.args).toEqual([]);
  expect(config.cwd).toBe("/repo");
  expect(config.model).toBe("gpt-5.4/xhigh");
  expect(config.reasoningEffort).toBeUndefined();
  expect(toDownstreamAgentSelection(config)).toEqual({
    provider: "codex",
    model: "gpt-5.4/xhigh",
  });
});

test("resolveDefaultDownstreamAgentConfig still supports raw env overrides", () => {
  const originalCommand = process.env.NANOBOSS_AGENT_CMD;
  const originalArgs = process.env.NANOBOSS_AGENT_ARGS;
  const originalModel = process.env.NANOBOSS_AGENT_MODEL;

  process.env.NANOBOSS_AGENT_CMD = "custom-agent";
  process.env.NANOBOSS_AGENT_ARGS = "[\"--foo\",\"bar\"]";
  delete process.env.NANOBOSS_AGENT_MODEL;

  try {
    const config = resolveDefaultDownstreamAgentConfig("/repo");

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

test("resolveDefaultDownstreamAgentConfig reads default model from env for known providers", () => {
  const originalCommand = process.env.NANOBOSS_AGENT_CMD;
  const originalArgs = process.env.NANOBOSS_AGENT_ARGS;
  const originalModel = process.env.NANOBOSS_AGENT_MODEL;

  process.env.NANOBOSS_AGENT_CMD = "copilot";
  process.env.NANOBOSS_AGENT_ARGS = "[\"--acp\",\"--allow-all-tools\"]";
  process.env.NANOBOSS_AGENT_MODEL = "gpt-5.4/xhigh";

  try {
    const config = resolveDefaultDownstreamAgentConfig("/repo");

    expect(config.provider).toBe("copilot");
    expect(config.command).toBe("copilot");
    expect(config.args).toEqual(["--acp", "--allow-all-tools"]);
    expect(config.cwd).toBe("/repo");
    expect(config.model).toBe("gpt-5.4");
    expect(config.reasoningEffort).toBe("xhigh");
  } finally {
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
