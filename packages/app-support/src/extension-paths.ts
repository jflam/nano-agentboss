import { join, resolve } from "node:path";

import { getNanobossHome } from "./nanoboss-home.ts";
import { detectRepoRoot, resolveLocalNanobossRoot, uniquePaths } from "./path-utils.ts";

export function resolveRepoExtensionRoot(cwd: string): string | undefined {
  const repoRoot = detectRepoRoot(resolve(cwd));
  return repoRoot ? join(repoRoot, ".nanoboss", "extensions") : undefined;
}

export function resolveProfileExtensionRoot(): string {
  return join(getNanobossHome(), "extensions");
}

export function resolveWorkspaceExtensionRoots(
  cwd: string,
  profileExtensionRoot = resolveProfileExtensionRoot(),
): string[] {
  return uniquePaths([
    resolveLocalNanobossRoot(cwd, "extensions"),
    profileExtensionRoot,
  ]);
}
