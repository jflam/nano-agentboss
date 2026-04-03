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
const STATIC_NANOBOSS_BLOCKED_TOOL_NAMES = new Set([
  "procedure_dispatch_start",
  "procedure_dispatch_status",
  "procedure_dispatch_wait",
  "procedure_dispatch",
]);

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
    instructions: "Use these tools to inspect nanoboss session cells and refs, defaulting to the current session when possible. Async slash-command dispatch is available only from the attached nanoboss-session MCP server, not this top-level nanoboss server.",
    listTools: listStaticNanobossMcpTools,
    callTool: callStaticNanobossMcpTool,
    formatToolResult: formatSessionMcpToolResult,
  });
}

function listStaticNanobossMcpTools() {
  return listSessionMcpTools().filter((tool) => !STATIC_NANOBOSS_BLOCKED_TOOL_NAMES.has(tool.name));
}

async function callStaticNanobossMcpTool(
  api: ReturnType<typeof createSessionMcpApi>,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (STATIC_NANOBOSS_BLOCKED_TOOL_NAMES.has(name)) {
    throw new Error(`Tool ${name} is only available from the attached nanoboss-session MCP server.`);
  }

  return await callSessionMcpTool(api, name, args);
}

