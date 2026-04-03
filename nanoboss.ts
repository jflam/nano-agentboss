import { runCliCommand } from "./cli.ts";
import { runResumeCommand } from "./resume.ts";
import { DEFAULT_HTTP_SERVER_PORT, DEFAULT_HTTP_SERVER_URL } from "./src/defaults.ts";
import { runDoctorCommand } from "./src/doctor.ts";
import { runHttpServerCommand } from "./src/http-server.ts";
import { runSessionMcpStdioCommand } from "./src/session-mcp-stdio.ts";
import { runProcedureDispatchWorkerCommand } from "./src/procedure-dispatch-jobs.ts";
import { runAcpServerCommand } from "./src/server.ts";

export type NanobossSubcommand = "cli" | "tui" | "resume" | "server" | "acp-server" | "session-mcp" | "procedure-dispatch-worker" | "doctor" | "help";

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
    first === "tui" ||
    first === "resume" ||
    first === "server" ||
    first === "acp-server" ||
    first === "doctor" ||
    first === "session-mcp" ||
    first === "procedure-dispatch-worker"
  ) {
    return {
      command: first,
      args: rest,
    };
  }

  throw new Error(`Unknown nanoboss command: ${first}`);
}

export async function runNanoboss(argv: string[]): Promise<void> {
  const parsed = parseNanobossArgs(argv);

  switch (parsed.command) {
    case "cli":
    case "tui":
      await runCliCommand(parsed.args);
      return;
    case "resume":
      await runResumeCommand(parsed.args);
      return;
    case "server":
      await runHttpServerCommand(parsed.args);
      return;
    case "acp-server":
      await runAcpServerCommand();
      return;
    case "session-mcp":
      await runSessionMcpStdioCommand(parsed.args);
      return;
    case "procedure-dispatch-worker":
      await runProcedureDispatchWorkerCommand(parsed.args);
      return;
    case "doctor":
      await runDoctorCommand(parsed.args);
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
    "  cli                Launch the interactive frontend",
    "  tui                Alias for the interactive pi-tui frontend",
    "  resume             Resume a saved CLI session",
    "  server             Launch the HTTP/SSE server",
    "  doctor             Show agent and attached session-MCP health",
    "  acp-server         Launch the internal stdio ACP server",
    "  session-mcp        Launch the internal stdio session MCP server",
    "  procedure-dispatch-worker  Launch the internal async procedure dispatch worker",
    "  help               Show this help text",
    "",
    "Examples:",
    `  nanoboss server --port ${DEFAULT_HTTP_SERVER_PORT}`,
    "  nanoboss cli",
    "  nanoboss tui",
    "  nanoboss resume",
    `  nanoboss cli --server-url ${DEFAULT_HTTP_SERVER_URL}`,
    "",
  ].join("\n"));
}

if (import.meta.main) {
  await runNanoboss(Bun.argv.slice(2));
}
