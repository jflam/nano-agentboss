import {
  parseFrontendConnectionOptions,
  type FrontendConnectionOptions,
} from "./frontend-connection.ts";

export type CliOptions = FrontendConnectionOptions;

export function parseCliOptions(argv: string[]): CliOptions {
  const { showToolCalls, showHelp, connectionMode, serverUrl } = parseFrontendConnectionOptions(argv);
  return { showToolCalls, showHelp, connectionMode, serverUrl };
}
