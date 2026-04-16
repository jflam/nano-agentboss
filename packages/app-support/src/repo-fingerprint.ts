import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { detectRepoRoot } from "./procedure-paths.ts";

const DEFAULT_EXCLUDED_NAMES = new Set([
  ".git",
  ".nanoboss",
  "coverage",
  "dist",
  "node_modules",
]);
const DEFAULT_EXCLUDED_NAME_PATTERNS = [
  /^\.tmp(?:$|[-.])/i,
];
const DEFAULT_EXCLUDED_FILE_PATTERNS = [
  /~$/,
  /^\.#/,
  /^#.*#$/,
  /\.(?:swp|swo|tmp|temp)$/i,
  /^\.DS_Store$/,
] as const;

export interface RepoFingerprintOptions {
  cwd: string;
  include?: string[];
  exclude?: string[];
}

export interface RepoFingerprintResult {
  repoRoot: string;
  fingerprint: string;
  fileCount: number;
}

export function computeRepoFingerprint(options: RepoFingerprintOptions): RepoFingerprintResult {
  const repoRoot = resolve(detectRepoRoot(options.cwd) ?? options.cwd);
  const includeSet = new Set(normalizePaths(options.include ?? []));
  const excludeSet = new Set(normalizePaths(options.exclude ?? []));
  const files = listRelevantFiles(repoRoot, repoRoot, includeSet, excludeSet);
  const hash = createHash("sha256");
  let includedFileCount = 0;

  for (const file of files) {
    const contents = readRepoFile(join(repoRoot, file));
    if (!contents) {
      continue;
    }

    hash.update(`${file}\n`);
    hash.update(contents);
    hash.update("\n");
    includedFileCount += 1;
  }

  return {
    repoRoot,
    fingerprint: hash.digest("hex").slice(0, 12),
    fileCount: includedFileCount,
  };
}

function listRelevantFiles(
  root: string,
  currentDir: string,
  includeSet: Set<string>,
  excludeSet: Set<string>,
): string[] {
  if (!existsSync(currentDir)) {
    return [];
  }

  const entries = readDirectoryEntries(currentDir);
  if (!entries) {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);
    const relativePath = normalizePath(relative(root, absolutePath));
    if (!relativePath || shouldExclude(relativePath, entry.name, includeSet, excludeSet)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...listRelevantFiles(root, absolutePath, includeSet, excludeSet));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function readDirectoryEntries(path: string): Dirent[] | undefined {
  try {
    return readdirSync(path, { encoding: "utf8", withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    if (isTransientMissingPathError(error)) {
      return undefined;
    }
    throw error;
  }
}

function readRepoFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (isTransientMissingPathError(error)) {
      return undefined;
    }
    throw error;
  }
}

function shouldExclude(
  relativePath: string,
  entryName: string,
  includeSet: Set<string>,
  excludeSet: Set<string>,
): boolean {
  if (matchesPrefix(excludeSet, relativePath)) {
    return true;
  }

  if (
    DEFAULT_EXCLUDED_NAMES.has(entryName)
    || DEFAULT_EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(entryName))
    || DEFAULT_EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(entryName))
  ) {
    return !matchesPrefix(includeSet, relativePath);
  }

  if (includeSet.size === 0) {
    return false;
  }

  return !matchesPrefix(includeSet, relativePath);
}

function matchesPrefix(prefixes: Set<string>, relativePath: string): boolean {
  for (const prefix of prefixes) {
    if (relativePath === prefix || relativePath.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

function normalizePaths(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizePath(value)).filter((value) => value.length > 0))];
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/gu, "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
}

function isTransientMissingPathError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return error.code === "ENOENT" || error.code === "ENOTDIR";
}
