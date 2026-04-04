import { getBuildLabel } from "../core/build-info.ts";
import { dispatchMcpToolsMethod } from "./jsonrpc.ts";
import {
  callSessionMcpTool,
  createSessionMcpApi,
  formatSessionMcpToolResult,
  listSessionMcpTools,
} from "./session.ts";
import { runStdioJsonRpcServer } from "./stdio-jsonrpc.ts";

const NANOBOSS_MCP_PROTOCOL_VERSION = "2025-11-25";
const NANOBOSS_MCP_SERVER_NAME = "nanoboss";
const NANOBOSS_MCP_INSTRUCTIONS = "Use these tools to dispatch nanoboss procedures and inspect durable session state for the current session. If a current-session pointer exists, it is used automatically. Prefer procedure_dispatch_start plus procedure_dispatch_wait for slash-command execution.";

export async function runMcpCommand(argv: string[] = []): Promise<void> {
  const [subcommand] = argv;
  if (!subcommand || subcommand === "proxy") {
    const api = createCurrentSessionBackedSessionMcpApi();
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
    "  proxy              Launch the global nanoboss MCP stdio server",
    "",
  ].join("\n"));
}

function createCurrentSessionBackedSessionMcpApi() {
  return createSessionMcpApi({
    cwd: process.cwd(),
    allowCurrentSessionFallback: true,
  });
}

async function dispatchNanobossMcpMethod(
  api: ReturnType<typeof createCurrentSessionBackedSessionMcpApi>,
  method: string,
  params: unknown,
): Promise<unknown> {
  return await dispatchMcpToolsMethod({
    api,
    method,
    messageParams: params,
    protocolVersion: NANOBOSS_MCP_PROTOCOL_VERSION,
    serverName: NANOBOSS_MCP_SERVER_NAME,
    serverVersion: getBuildLabel(),
    instructions: NANOBOSS_MCP_INSTRUCTIONS,
    listTools: listSessionMcpTools,
    callTool: callSessionMcpTool,
    formatToolResult: formatSessionMcpToolResult,
  });
}
