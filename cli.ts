import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { Readable, Writable } from "node:stream";

class CliClient implements acp.Client {
  availableCommands: string[] = [];

  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const selected =
      params.options.find((option) => option.kind.startsWith("allow")) ??
      params.options[0];

    if (!selected) {
      return { outcome: { outcome: "cancelled" } };
    }

    return {
      outcome: {
        outcome: "selected",
        optionId: selected.optionId,
      },
    };
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update;

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          process.stdout.write(update.content.text);
        }
        break;
      case "tool_call":
        process.stderr.write(`\n[tool] ${update.title} (${update.status ?? "pending"})\n`);
        break;
      case "tool_call_update":
        if (update.status) {
          process.stderr.write(
            `\n[tool:${update.toolCallId}] ${update.status}${update.title ? ` ${update.title}` : ""}\n`,
          );
        }
        break;
      case "available_commands_update":
        this.availableCommands = update.availableCommands.map((command) => `/${command.name}`);
        break;
      default:
        break;
    }
  }

  completer = (line: string): [string[], string] => {
    const matches = this.availableCommands.filter((command) => command.startsWith(line));
    return [matches.length > 0 ? matches : this.availableCommands, line];
  };
}

async function main(): Promise<void> {
  const server = spawn("bun", ["run", "src/server.ts"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "inherit"],
  });

  if (!server.stdin || !server.stdout) {
    throw new Error("Failed to start nano-agentboss server process");
  }

  const client = new CliClient();
  const stream = acp.ndJsonStream(
    Writable.toWeb(server.stdin),
    Readable.toWeb(server.stdout),
  );
  const connection = new acp.ClientSideConnection(() => client, stream);

  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });

  const session = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer: client.completer,
  });

  try {
    while (true) {
      const line = await rl.question("> ");
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed === "exit" || trimmed === "quit") {
        break;
      }

      await connection.prompt({
        sessionId: session.sessionId,
        prompt: [
          {
            type: "text",
            text: line,
          },
        ],
      });
      process.stdout.write("\n");
    }
  } finally {
    rl.close();
    server.kill();
  }
}

void main();
