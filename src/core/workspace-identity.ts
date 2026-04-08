import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { getNanobossHome } from "./config.ts";

export interface WorkspaceIdentity {
  cwd: string;
  repoRoot?: string;
  workspaceKey: string;
  commandDirs: string[];
  commandsFingerprint: string;
}

export function getWorkspaceIdentity(cwd: string): WorkspaceIdentity {
  const resolvedCwd = resolve(cwd);
  const repoRoot = detectRepoRoot(resolvedCwd);
  const commandDirs = resolveWorkspaceCommandDirs(resolvedCwd);
  return {
    cwd: resolvedCwd,
    repoRoot,
    workspaceKey: repoRoot ?? resolvedCwd,
    commandDirs,
    commandsFingerprint: computeCommandsFingerprint(commandDirs),
  };
}

export function resolveWorkspaceKey(cwd: string): string {
  return getWorkspaceIdentity(cwd).workspaceKey;
}

export function resolveWorkspaceCommandDirs(cwd: string): string[] {
  return uniquePaths([
    resolve(cwd, "commands"),
    join(getNanobossHome(), "commands"),
  ]);
}

export function computeCommandsFingerprint(commandDirs: string[]): string {
  const hash = createHash("sha256");

  for (const commandDir of uniquePaths(commandDirs)) {
    hash.update(`${commandDir}\n`);
    if (!existsSync(commandDir)) {
      hash.update("<missing>\n");
      continue;
    }

    const files = listTypeScriptFiles(commandDir);

    for (const file of files) {
      const path = join(commandDir, file);
      hash.update(`${file}\n`);
      hash.update(readFileSync(path));
      hash.update("\n");
    }
  }

  return hash.digest("hex").slice(0, 12);
}

function listTypeScriptFiles(rootDir: string, prefix = ""): string[] {
  const files: string[] = [];
  const entries = readdirSync(join(rootDir, prefix), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    const relativePath = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(rootDir, relativePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(relativePath);
    }
  }

  return files;
}

function detectRepoRoot(cwd: string): string | undefined {
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

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => resolve(path)))];
}
