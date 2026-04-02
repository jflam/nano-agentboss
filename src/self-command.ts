import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface SelfCommand {
  command: string;
  args: string[];
}

interface SelfCommandRuntime {
  executable: string;
  scriptPath?: string;
}

export function resolveSelfCommand(subcommand: string, args: string[] = []): SelfCommand {
  return resolveSelfCommandWithRuntime(subcommand, args, {
    executable: process.execPath,
    scriptPath: process.argv[1],
  });
}

export function resolveSelfCommandWithRuntime(
  subcommand: string,
  args: string[] = [],
  runtime: SelfCommandRuntime,
): SelfCommand {
  const executable = runtime.executable;
  const scriptPath = runtime.scriptPath;

  if (shouldUseSourceEntrypoint(scriptPath, executable)) {
    // Always resolve to nanoboss.ts, not process.argv[1]. When test scripts or other
    // entry points instantiate NanobossService directly, process.argv[1] points to
    // the caller rather than nanoboss.ts, which is the only entry point that implements
    // full subcommand dispatch.
    const nanobossScript = resolve(dirname(fileURLToPath(import.meta.url)), "..", "nanoboss.ts");
    return {
      command: executable,
      args: [nanobossScript, subcommand, ...args],
    };
  }

  return {
    command: executable,
    args: [subcommand, ...args],
  };
}

function shouldUseSourceEntrypoint(scriptPath: string | undefined, executable: string): boolean {
  if (!scriptPath || scriptPath === executable) {
    return false;
  }

  if (!/\.[cm]?[jt]sx?$/i.test(scriptPath)) {
    return false;
  }

  if (scriptPath.startsWith("/$bunfs/")) {
    return false;
  }

  return existsSync(scriptPath);
}
