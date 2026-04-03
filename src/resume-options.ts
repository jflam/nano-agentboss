import { DEFAULT_HTTP_SERVER_URL } from "./defaults.ts";

export interface ResumeOptions {
  showToolCalls: boolean;
  showHelp: boolean;
  serverUrl: string;
  list: boolean;
  sessionId?: string;
}

export function parseResumeOptions(argv: string[]): ResumeOptions {
  let showToolCalls = true;
  let showHelp = false;
  let serverUrl = Bun.env.NANOBOSS_SERVER_URL ?? DEFAULT_HTTP_SERVER_URL;
  let list = false;
  let sessionId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    switch (arg) {
      case "--tool-calls":
        showToolCalls = true;
        break;
      case "--no-tool-calls":
        showToolCalls = false;
        break;
      case "--server-url":
        serverUrl = argv[index + 1];
        index += 1;
        break;
      case "--list":
        list = true;
        break;
      case "-h":
      case "--help":
        showHelp = true;
        break;
      default:
        if (arg.startsWith("--server-url=")) {
          serverUrl = arg.slice("--server-url=".length);
          break;
        }

        if (!arg.startsWith("-") && !sessionId) {
          sessionId = arg;
          break;
        }
        break;
    }
  }

  return {
    showToolCalls,
    showHelp,
    serverUrl,
    list,
    sessionId,
  };
}
