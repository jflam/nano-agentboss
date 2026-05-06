import { join } from "node:path";

import { getNanobossHome } from "@nanoboss/app-support";
import type {
  DownstreamAgentConfig,
  DownstreamAgentProvider,
  DownstreamAgentSelection,
} from "@nanoboss/procedure-sdk";
import {
  buildAgentModelSelection,
  parseAgentModelSelection,
} from "./model-catalog.ts";

const DEFAULT_AGENT_COMMAND = "copilot";
const DEFAULT_AGENT_ARGS = ["--acp", "--allow-all-tools"];

export function getAgentTranscriptDir(): string {
  return join(getNanobossHome(), "agent-logs");
}

export function resolveDefaultDownstreamAgentConfig(cwd = process.cwd()): DownstreamAgentConfig {
  const command = process.env.NANOBOSS_AGENT_CMD?.trim() || DEFAULT_AGENT_COMMAND;
  const provider = inferProviderFromCommand(command);
  const baseConfig = provider ? baseAgentConfig(provider) : undefined;
  const args = parseArgs(process.env.NANOBOSS_AGENT_ARGS) ?? baseConfig?.args ?? DEFAULT_AGENT_ARGS;
  const parsedModel = provider && process.env.NANOBOSS_AGENT_MODEL?.trim()
    ? parseAgentModelSelection(provider, process.env.NANOBOSS_AGENT_MODEL)
    : undefined;

  return {
    provider,
    command,
    args,
    cwd,
    env: baseConfig?.env,
    model: parsedModel?.modelId,
    reasoningEffort: parsedModel?.reasoningEffort,
  };
}

export function resolveSelectedDownstreamAgentConfig(
  selection: DownstreamAgentSelection,
  cwd = process.cwd(),
): DownstreamAgentConfig {
  const parsedModel = selection.model
    ? parseAgentModelSelection(selection.provider, selection.model)
    : undefined;

  return {
    ...baseAgentConfig(selection.provider),
    cwd,
    model: parsedModel?.modelId || undefined,
    reasoningEffort: parsedModel?.reasoningEffort,
  };
}

export function toDownstreamAgentSelection(
  config: DownstreamAgentConfig,
): DownstreamAgentSelection | undefined {
  if (!config.provider) {
    return undefined;
  }

  const model = config.model
    ? buildAgentModelSelection(config.provider, config.model, config.reasoningEffort)
    : undefined;

  return {
    provider: config.provider,
    model,
  };
}

function baseAgentConfig(provider: DownstreamAgentProvider): DownstreamAgentConfig {
  switch (provider) {
    case "claude":
      return {
        provider,
        command: "claude-code-acp",
        args: [],
        env: {
          ANTHROPIC_API_KEY: "",
          CLAUDE_API_KEY: "",
        },
      };
    case "gemini":
      return {
        provider,
        command: "gemini",
        args: ["--acp"],
      };
    case "codex":
      return {
        provider,
        command: "codex-acp",
        args: [],
      };
    case "copilot":
      return {
        provider,
        command: "copilot",
        args: ["--acp", "--allow-all-tools"],
      };
  }
}

function inferProviderFromCommand(command: string): DownstreamAgentProvider | undefined {
  switch (command) {
    case "claude-code-acp":
      return "claude";
    case "gemini":
      return "gemini";
    case "codex-acp":
      return "codex";
    case "copilot":
      return "copilot";
    default:
      return undefined;
  }
}

function parseArgs(value: string | undefined): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    return value.split(/\s+/).filter(Boolean);
  }

  return undefined;
}
