import { getBuildLabel } from "./build-info.ts";
import { dispatchMcpToolsMethod } from "./mcp-jsonrpc.ts";
import {
  callSessionMcpTool,
  createSessionMcpApi,
  formatSessionMcpToolResult,
  listSessionMcpTools,
} from "./session-mcp.ts";
import { runStdioJsonRpcServer } from "./stdio-jsonrpc.ts";

const NANOBOSS_MCP_PROTOCOL_VERSION = "2025-11-25";

export async function runMcpCommand(argv: string[] = []): Promise<void> {
  const [subcommand] = argv;
  if (!subcommand || subcommand === "proxy") {
    const api = createSessionMcpApi({ cwd: process.cwd() });
    await runStdioJsonRpcServer((method, params) => dispatchNanobossMcpMethod(api, method, params));
    return;
  }

  if (subcommand === "help" || subcommand === "-h" || subcommand === "--help") {
    printMcpHelp();
    return;
  }

  throw new Error(`Unknown mcp command: ${subcommand}`);
}

export function printMcpHelp(): void {
  process.stdout.write([
    "Usage: nanoboss mcp proxy",
    "",
    "Commands:",
    "  proxy              Launch the static nanoboss MCP stdio server",
    "",
  ].join("\n"));
}


async function dispatchNanobossMcpMethod(
  api: ReturnType<typeof createSessionMcpApi>,
  method: string,
  params: unknown,
): Promise<unknown> {
  return await dispatchMcpToolsMethod({
    api,
    method,
    messageParams: params,
    protocolVersion: NANOBOSS_MCP_PROTOCOL_VERSION,
    serverName: "nanoboss",
    serverVersion: getBuildLabel(),
    instructions: "Use these tools to inspect nanoboss session cells and refs, defaulting to the current session when possible.",
    listTools: listSessionMcpTools,
    callTool: callSessionMcpTool,
    formatToolResult: formatSessionMcpToolResult,
  });
}

