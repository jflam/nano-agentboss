import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { detectRepoRoot } from "./procedure-paths.ts";

export { detectRepoRoot };

export function resolveLocalNanobossRoot(cwd: string, subdir: string): string {
  const resolvedCwd = resolve(cwd);
  const cwdRoot = join(resolvedCwd, ".nanoboss", subdir);
  if (existsSync(cwdRoot)) {
    return cwdRoot;
  }

  return join(detectRepoRoot(resolvedCwd) ?? resolvedCwd, ".nanoboss", subdir);
}

export function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => resolve(path)))];
}
