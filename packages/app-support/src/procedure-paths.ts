import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

import { getNanobossHome } from "./nanoboss-home.ts";
import { resolveLocalNanobossRoot, uniquePaths } from "./path-utils.ts";

export function detectRepoRoot(cwd: string): string | undefined {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return root ? resolve(root) : undefined;
  } catch {
    return undefined;
  }
}

export function resolveRepoProcedureRoot(cwd: string): string | undefined {
  const repoRoot = detectRepoRoot(resolve(cwd));
  return repoRoot ? join(repoRoot, ".nanoboss", "procedures") : undefined;
}

export function resolveProfileProcedureRoot(): string {
  return join(getNanobossHome(), "procedures");
}

export function resolveWorkspaceProcedureRoots(
  cwd: string,
  profileProcedureRoot = resolveProfileProcedureRoot(),
): string[] {
  return uniquePaths([
    resolveLocalNanobossRoot(cwd, "procedures"),
    profileProcedureRoot,
  ]);
}

export function resolvePersistProcedureRoot(
  cwd: string,
  profileProcedureRoot = resolveProfileProcedureRoot(),
): string {
  return resolve(resolveRepoProcedureRoot(cwd) ?? profileProcedureRoot);
}
