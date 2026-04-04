import {
  parseFrontendConnectionOptions,
  type FrontendConnectionOptions,
} from "./frontend-connection.ts";

export interface CliOptions extends FrontendConnectionOptions {}

export function parseCliOptions(argv: string[]): CliOptions {
  const { remainingArgs: _remainingArgs, ...options } = parseFrontendConnectionOptions(argv);
  return options;
}
