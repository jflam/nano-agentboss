import type * as acp from "@agentclientprotocol/sdk";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function resolveSelfCommand(subcommand: string, args: string[] = []): { command: string; args: string[] } {
  const override = process.env.NANOBOSS_SELF_COMMAND?.trim();
  if (override) {
    return {
      command: override,
      args: [subcommand, ...args],
    };
  }

  const executable = process.execPath;
  const scriptPath = process.argv[1];
  const nanobossScript = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "nanoboss.ts");

  if (shouldUseSourceEntrypoint(scriptPath, executable) || shouldUseSourceEntrypointWithoutScript(scriptPath, executable, nanobossScript)) {
    return {
      command: executable,
      args: [nanobossScript, subcommand, ...args],
    };
  }

  return {
    command: executable,
    args: [subcommand, ...args],
  };
}

function shouldUseSourceEntrypoint(scriptPath: string | undefined, executable: string): boolean {
  if (!scriptPath || scriptPath === executable) {
    return false;
  }

  if (!/\.[cm]?[jt]sx?$/i.test(scriptPath)) {
    return false;
  }

  if (scriptPath.startsWith("/$bunfs/")) {
    return false;
  }

  return existsSync(scriptPath);
}

function shouldUseSourceEntrypointWithoutScript(
  scriptPath: string | undefined,
  executable: string,
  nanobossScript: string,
): boolean {
  if (scriptPath && scriptPath !== executable && !scriptPath.startsWith("/$bunfs/")) {
    return false;
  }

  return executable.includes("bun") && existsSync(nanobossScript);
}
