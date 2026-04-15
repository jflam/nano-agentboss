import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, parse, resolve } from "node:path";

export function getNanobossHome(): string {
  return join(process.env.HOME?.trim() || homedir(), ".nanoboss");
}

export function getSessionDir(sessionId: string): string {
  return join(getNanobossHome(), "sessions", sessionId);
}

export function resolveWorkspaceKey(cwd: string): string {
  const resolvedCwd = resolve(cwd);
  return detectRepoRoot(resolvedCwd) ?? resolvedCwd;
}

function detectRepoRoot(startDir: string): string | undefined {
  let current = startDir;

  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current || current === parse(current).root) {
      return undefined;
    }

    current = parent;
  }
}
