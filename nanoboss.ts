import { runCliCommand } from "./cli.ts";
import { runHttpServerCommand } from "./src/http-server.ts";
import { runAcpServerCommand } from "./src/server.ts";
import { runSessionMcpServerCommand } from "./src/session-mcp.ts";

export type NanobossSubcommand = "cli" | "server" | "acp-server" | "session-mcp-server" | "help";

export interface NanobossArgs {
  command: NanobossSubcommand;
  args: string[];
}

export function parseNanobossArgs(argv: string[]): NanobossArgs {
  const [first, ...rest] = argv;

  if (!first || first === "help" || first === "-h" || first === "--help") {
    return {
      command: "help",
      args: [],
    };
  }

  if (
    first === "cli" ||
    first === "server" ||
    first === "acp-server" ||
    first === "session-mcp-server" ||
    first === "mcp-server"
  ) {
    return {
      command: first === "mcp-server" ? "session-mcp-server" : first,
      args: rest,
    };
  }

  throw new Error(`Unknown nanoboss command: ${first}`);
}

export async function runNanoboss(argv: string[]): Promise<void> {
  const parsed = parseNanobossArgs(argv);

  switch (parsed.command) {
    case "cli":
      await runCliCommand(parsed.args);
      return;
    case "server":
      await runHttpServerCommand(parsed.args);
      return;
    case "acp-server":
      await runAcpServerCommand();
      return;
    case "session-mcp-server":
      await runSessionMcpServerCommand();
      return;
    case "help":
      printHelp();
      return;
  }
}

export function printHelp(): void {
  process.stdout.write([
    "Usage: nanoboss <command> [options]",
    "",
    "Commands:",
    "  cli         Launch the CLI frontend",
    "  server      Launch the HTTP/SSE server",
    "  acp-server         Launch the internal stdio ACP server",
    "  session-mcp-server Launch the internal stdio MCP server",
    "  help               Show this help text",
    "",
    "Examples:",
    "  nanoboss server --port 3000",
    "  nanoboss cli --server-url http://localhost:3000",
    "",
  ].join("\n"));
}

if (import.meta.main) {
  await runNanoboss(Bun.argv.slice(2));
}
