import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const DELETED_ROOT_SHIM_PATHS = [
  "src/agent/token-metrics.ts",
  "src/core/service.ts",
  "src/http/client.ts",
  "src/http/server.ts",
  "src/mcp/jsonrpc.ts",
  "src/session/repository.ts",
  "src/tui/controller.ts",
] as const;

const DELETED_ROOT_HELPER_PATHS = [
  "src/procedure/tagged-json-line-stream.ts",
  "src/util/text.ts",
] as const;

const CANONICAL_IMPORT_EXPECTATIONS = [
  ["nanoboss.ts", 'import("@nanoboss/app-runtime")'],
  ["src/commands/http.ts", 'from "@nanoboss/adapters-http"'],
  ["tests/unit/tagged-json-line-stream.test.ts", 'from "@nanoboss/procedure-sdk"'],
  ["tests/unit/text.test.ts", 'from "@nanoboss/procedure-sdk"'],
  ["tests/unit/tui-controller.test.ts", 'from "@nanoboss/adapters-tui"'],
  ["tests/unit/mcp-server.test.ts", 'from "@nanoboss/app-runtime"'],
] as const;

const PACKAGE_EXPORT_EXPECTATIONS = [
  ["packages/adapters-http/src/index.ts", 'export * from "./client.ts";'],
  ["packages/adapters-http/src/index.ts", 'export * from "./server.ts";'],
  ["packages/adapters-mcp/src/index.ts", 'export * from "./jsonrpc.ts";'],
  ["packages/adapters-tui/src/index.ts", 'export * from "./controller.ts";'],
  ["packages/agent-acp/src/index.ts", 'from "./token-metrics.ts";'],
  ["packages/procedure-sdk/src/index.ts", 'from "./tagged-json-line-stream.ts";'],
  ["packages/procedure-sdk/src/index.ts", 'from "./text.ts";'],
  ["packages/store/src/index.ts", 'from "./session-repository.ts";'],
  [
    "packages/app-runtime/src/index.ts",
    "createCurrentSessionBackedNanobossRuntimeService",
  ],
  ["packages/app-runtime/src/index.ts", "createNanobossRuntimeService"],
] as const;

const bannedPackageInternalImportPattern = /^\s*(?:import|export)\b[^;]*?["'][^"']*packages\/[^"']*\/src\/[^"']*["'];?/gm;
const bannedPackageInternalDynamicImportPattern = /import\(\s*["'][^"']*packages\/[^"']*\/src\/[^"']*["']\s*\)/g;
const bannedDeletedRootImportPattern = createDeletedRootImportPattern(
  [...DELETED_ROOT_SHIM_PATHS, ...DELETED_ROOT_HELPER_PATHS],
  "^(?:\\s*(?:import|export)\\b[^;]*?from\\s*[\"'][^\"']*|\\s*import\\s*[\"'][^\"']*)",
  "[\"'];?",
  "gm",
);
const bannedDeletedRootDynamicImportPattern = createDeletedRootImportPattern(
  [...DELETED_ROOT_SHIM_PATHS, ...DELETED_ROOT_HELPER_PATHS],
  "import\\(\\s*[\"'][^\"']*",
  "[\"']\\s*\\)",
  "g",
);

test("deleted root shims stay removed and root entrypoints use canonical package APIs", () => {
  for (const path of [...DELETED_ROOT_SHIM_PATHS, ...DELETED_ROOT_HELPER_PATHS]) {
    expect(existsSync(join(process.cwd(), path))).toBe(false);
  }

  for (const [path, snippet] of CANONICAL_IMPORT_EXPECTATIONS) {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).toContain(snippet);
  }

  for (const [path, snippet] of PACKAGE_EXPORT_EXPECTATIONS) {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).toContain(snippet);
  }

  const rootTypeScriptFiles = [
    join(process.cwd(), "nanoboss.ts"),
    ...listTypeScriptFilesIn(join(process.cwd(), "src")),
  ];
  for (const path of rootTypeScriptFiles) {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(bannedPackageInternalImportPattern);
    expect(source).not.toMatch(bannedPackageInternalDynamicImportPattern);
  }

  for (const path of listRepositoryTypeScriptFiles()) {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(bannedDeletedRootImportPattern);
    expect(source).not.toMatch(bannedDeletedRootDynamicImportPattern);
  }
});

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

  return files.sort((left, right) => relative(process.cwd(), left).localeCompare(relative(process.cwd(), right)));
}

function createDeletedRootImportPattern(
  paths: readonly string[],
  prefix: string,
  suffix: string,
  flags: string,
): RegExp {
  const alternatives = paths
    .map((path) => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`${prefix}(?:${alternatives})${suffix}`, flags);
}

function listRepositoryTypeScriptFiles(): string[] {
  return [
    ...listTypeScriptFilesIn(join(process.cwd(), "src")),
    ...listTypeScriptFilesIn(join(process.cwd(), "packages")),
    ...listTypeScriptFilesIn(join(process.cwd(), "procedures")),
    ...listTypeScriptFilesIn(join(process.cwd(), "scripts")),
    ...listTypeScriptFilesIn(join(process.cwd(), "tests")),
    ...["build.ts", "cli.ts", "nanoboss.ts", "preload.ts", "resume.ts"]
      .map((path) => join(process.cwd(), path))
      .filter((path) => existsSync(path)),
  ].sort((left, right) => relative(process.cwd(), left).localeCompare(relative(process.cwd(), right)));
}
