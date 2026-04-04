import {
  createCurrentSessionBackedSessionMcpApi,
  GLOBAL_MCP_INSTRUCTIONS,
  GLOBAL_MCP_SERVER_NAME,
  runSessionMcpServer,
} from "./session.ts";

export async function runMcpCommand(argv: string[] = []): Promise<void> {
  const [subcommand] = argv;
  if (!subcommand || subcommand === "proxy") {
    const api = createCurrentSessionBackedSessionMcpApi();
    await runSessionMcpServer(api, {
      serverName: GLOBAL_MCP_SERVER_NAME,
      instructions: GLOBAL_MCP_INSTRUCTIONS,
    });
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
