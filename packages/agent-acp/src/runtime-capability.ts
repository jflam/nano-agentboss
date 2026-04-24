import type * as acp from "@agentclientprotocol/sdk";
import { resolveSelfCommand } from "@nanoboss/app-support";

interface AgentRuntimeSessionRuntime {
  mcpServers: NonNullable<acp.NewSessionRequest["mcpServers"]>;
}

type AgentRuntimeSessionRuntimeFactory = () => AgentRuntimeSessionRuntime;

let runtimeFactory: AgentRuntimeSessionRuntimeFactory | undefined;

const NANOBOSS_MCP_SERVER_NAME = "nanoboss";

export function setAgentRuntimeSessionRuntimeFactory(
  factory: AgentRuntimeSessionRuntimeFactory | undefined,
): void {
  runtimeFactory = factory;
}

export function buildAgentRuntimeSessionRuntime(): AgentRuntimeSessionRuntime {
  return runtimeFactory?.() ?? {
    mcpServers: [buildDefaultNanobossMcpServer()],
  };
}

function buildDefaultNanobossMcpServer(): NonNullable<acp.NewSessionRequest["mcpServers"]>[number] {
  const command = resolveSelfCommand("mcp");
  return {
    type: "stdio",
    name: NANOBOSS_MCP_SERVER_NAME,
    command: command.command,
    args: command.args,
    env: [],
  } as NonNullable<acp.NewSessionRequest["mcpServers"]>[number];
}
