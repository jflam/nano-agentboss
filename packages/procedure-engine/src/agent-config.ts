import {
  resolveDefaultDownstreamAgentConfig,
  resolveSelectedDownstreamAgentConfig,
} from "@nanoboss/agent-acp";
import { readPersistedDefaultAgentSelection } from "@nanoboss/store";
import type {
  DownstreamAgentConfig,
  DownstreamAgentSelection,
} from "@nanoboss/procedure-sdk";

export function resolveDownstreamAgentConfig(
  cwd?: string,
  selection?: DownstreamAgentSelection,
): DownstreamAgentConfig {
  const resolvedCwd = cwd ?? process.cwd();
  if (selection) {
    return resolveSelectedDownstreamAgentConfig(selection, resolvedCwd);
  }

  if (!hasExplicitEnvOverride()) {
    const persistedSelection = readPersistedDefaultAgentSelection();
    if (persistedSelection) {
      return resolveSelectedDownstreamAgentConfig(persistedSelection, resolvedCwd);
    }
  }

  return resolveDefaultDownstreamAgentConfig(resolvedCwd);
}

function hasExplicitEnvOverride(): boolean {
  return Boolean(
    process.env.NANOBOSS_AGENT_CMD?.trim()
      || process.env.NANOBOSS_AGENT_ARGS?.trim()
      || process.env.NANOBOSS_AGENT_MODEL?.trim(),
  );
}
