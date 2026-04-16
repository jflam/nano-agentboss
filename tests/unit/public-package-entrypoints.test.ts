import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT_PUBLIC_IMPORT_EXPECTATIONS = [
  ["nanoboss.ts", 'import("@nanoboss/app-runtime")'],
  ["src/session/repository.ts", 'from "@nanoboss/store"'],
  ["src/http/server.ts", 'from "@nanoboss/adapters-http"'],
  ["src/http/client.ts", 'from "@nanoboss/adapters-http"'],
  ["src/mcp/jsonrpc.ts", 'from "@nanoboss/adapters-mcp"'],
  ["src/agent/token-metrics.ts", 'from "@nanoboss/agent-acp"'],
  ["src/tui/controller.ts", 'from "@nanoboss/adapters-tui"'],
  ["tests/unit/mcp-server.test.ts", 'from "@nanoboss/app-runtime"'],
] as const;

const PACKAGE_EXPORT_EXPECTATIONS = [
  [
    "packages/app-runtime/src/index.ts",
    "createCurrentSessionBackedNanobossRuntimeService",
  ],
  ["packages/app-runtime/src/index.ts", "createNanobossRuntimeService"],
  ["packages/adapters-mcp/src/index.ts", 'export * from "./jsonrpc.ts";'],
] as const;

const bannedPackageInternalImportPattern = /^\s*(?:import|export)\b[^;]*?["'][^"']*packages\/[^"']*\/src\/[^"']*["'];?/gm;
const bannedPackageInternalDynamicImportPattern = /import\(\s*["'][^"']*packages\/[^"']*\/src\/[^"']*["']\s*\)/g;

test("root entrypoints use package public entrypoints instead of package-internal src paths", () => {
  for (const [path, snippet] of ROOT_PUBLIC_IMPORT_EXPECTATIONS) {
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
