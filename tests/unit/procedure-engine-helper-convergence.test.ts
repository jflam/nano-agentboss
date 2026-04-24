import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BANNED_CORE_HELPERS = [
  "cancellation",
  "error-format",
  "timing-trace",
  "logger",
  "self-command",
  "data-shape",
  "run-result",
] as const;

const BANNED_CORE_BARRIER_FILES = [
  ...BANNED_CORE_HELPERS.map((name) => `src/core/${name}.ts`),
  "src/core/types.ts",
  "src/core/contracts.ts",
] as const;

const BANNED_ENGINE_HELPER_BARRIER_FILES = [
  "packages/procedure-engine/src/cancellation.ts",
  "packages/procedure-engine/src/error-format.ts",
  "packages/procedure-engine/src/self-command.ts",
  "packages/procedure-engine/src/text.ts",
] as const;

const BANNED_ENGINE_HELPER_EXPORTS = [
  "RunCancelledError",
  "defaultCancellationMessage",
  "normalizeRunCancelledError",
  "formatErrorMessage",
  "summarizeText",
  "RunCancellationReason",
] as const;

const CANONICAL_IMPORTERS = [
  ["packages/app-runtime/src/default-agent-policy.ts", 'from "@nanoboss/procedure-engine"'],
  ["packages/app-runtime/src/runtime-service.ts", 'from "@nanoboss/procedure-engine"'],
  ["packages/app-runtime/src/service.ts", 'from "@nanoboss/procedure-engine"'],
  ["packages/app-support/tests/self-command.test.ts", 'from "@nanoboss/app-support"'],
  ["packages/procedure-engine/tests/logger.test.ts", 'from "@nanoboss/procedure-engine/testing"'],
] as const;

const ROOT_TS_FILES = [
  "build.ts",
  "cli.ts",
  "nanoboss.ts",
  "preload.ts",
  "resume.ts",
] as const;

const bannedImportPattern = new RegExp(
  String.raw`^\s*(?:import|export)\b[^;]*?\bfrom\s*["'][^"']*src\/core\/(?:${BANNED_CORE_HELPERS.join("|")}|types|contracts)(?:\.ts)?["'];?`,
  "gm",
);

const bannedSideEffectImportPattern = new RegExp(
  String.raw`^\s*import\s*["'][^"']*src\/core\/(?:${BANNED_CORE_HELPERS.join("|")}|types|contracts)(?:\.ts)?["'];?`,
  "gm",
);

const bannedProcedureEngineHelperImportPattern = new RegExp(
  String.raw`^\s*import\s*{[^}]*\b(?:${BANNED_ENGINE_HELPER_EXPORTS.join("|")})\b[^}]*}\s*from\s*["']@nanoboss\/procedure-engine["'];?`,
  "gm",
);

test("keeps procedure-engine execution helpers converged on the package owner", () => {
  for (const path of BANNED_CORE_BARRIER_FILES) {
    expect(existsSync(join(process.cwd(), path))).toBe(false);
  }

  for (const path of BANNED_ENGINE_HELPER_BARRIER_FILES) {
    expect(existsSync(join(process.cwd(), path))).toBe(false);
  }

  for (const [path, expectedImport] of CANONICAL_IMPORTERS) {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).toContain(expectedImport);
  }

  for (const path of listRepositoryTypeScriptFiles()) {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(bannedImportPattern);
    expect(source).not.toMatch(bannedSideEffectImportPattern);
    expect(source).not.toMatch(bannedProcedureEngineHelperImportPattern);
  }
});

function listRepositoryTypeScriptFiles(): string[] {
  return [
    ...ROOT_TS_FILES.map((path) => join(process.cwd(), path)).filter((path) => existsSync(path)),
    ...listTypeScriptFilesIn(join(process.cwd(), "src")),
    ...listTypeScriptFilesIn(join(process.cwd(), "packages")),
    ...listTypeScriptFilesIn(join(process.cwd(), "procedures")),
    ...listTypeScriptFilesIn(join(process.cwd(), "tests")),
  ];
}

function listTypeScriptFilesIn(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") {
        continue;
      }
      files.push(...listTypeScriptFilesIn(path));
      continue;
    }

    if (entry.isFile() && path.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}
