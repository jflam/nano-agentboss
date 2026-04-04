import {
  createCurrentSessionBackedNanobossMcpApi,
  MCP_INSTRUCTIONS,
  MCP_SERVER_NAME,
  runMcpServer,
} from "./server.ts";

export async function runMcpCommand(argv: string[] = []): Promise<void> {
  const [subcommand] = argv;
  if (!subcommand || subcommand === "proxy") {
    const api = createCurrentSessionBackedNanobossMcpApi();
    await runMcpServer(api, {
      serverName: MCP_SERVER_NAME,
      instructions: MCP_INSTRUCTIONS,
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
