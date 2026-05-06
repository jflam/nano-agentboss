import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const REPO_ROOT = process.cwd();

const CYCLE_GUARDS = [
  {
    name: "TUI adapter",
    roots: ["packages/adapters-tui/src"],
  },
  {
    name: "runtime, engine, store, and agent adapter",
    roots: [
      "packages/app-runtime/src",
      "packages/procedure-engine/src",
      "packages/store/src",
      "packages/agent-acp/src",
    ],
  },
] as const;

test("keeps guarded package implementation imports acyclic", () => {
  for (const guard of CYCLE_GUARDS) {
    const graph = buildRelativeImportGraph(guard.roots);
    expect(findImportCycles(graph), guard.name).toEqual([]);
  }
});

function buildRelativeImportGraph(rootPaths: readonly string[]): Map<string, string[]> {
  const files = rootPaths
    .flatMap((rootPath) => listTypeScriptFiles(join(REPO_ROOT, rootPath)))
    .sort((left, right) => left.localeCompare(right));
  const fileSet = new Set(files);
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const imports = new Set<string>();

    const addRelativeImport = (specifier: string): void => {
      if (!specifier.startsWith(".")) {
        return;
      }
      const target = resolveImport(file, specifier, fileSet);
      if (target !== undefined) {
        imports.add(target);
      }
    };

    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        addRelativeImport(statement.moduleSpecifier.text);
        continue;
      }

      if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        addRelativeImport(statement.moduleSpecifier.text);
      }
    }

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1
      ) {
        const [specifier] = node.arguments;
        if (specifier && ts.isStringLiteral(specifier)) {
          addRelativeImport(specifier.text);
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    graph.set(file, [...imports].sort((left, right) => left.localeCompare(right)));
  }

  return graph;
}

function resolveImport(file: string, specifier: string, fileSet: ReadonlySet<string>): string | undefined {
  const absolute = resolve(dirname(file), specifier);
  const candidates = extname(absolute)
    ? [absolute]
    : [
        `${absolute}.ts`,
        join(absolute, "index.ts"),
      ];

  return candidates.find((candidate) => fileSet.has(candidate));
}

function findImportCycles(graph: ReadonlyMap<string, readonly string[]>): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles = new Set<string>();

  const visit = (file: string): void => {
    if (visited.has(file)) {
      return;
    }
    if (visiting.has(file)) {
      const start = stack.indexOf(file);
      const cycle = [...stack.slice(start), file]
        .map((entry) => relative(REPO_ROOT, entry).replaceAll("\\", "/"))
        .join(" -> ");
      cycles.add(cycle);
      return;
    }

    visiting.add(file);
    stack.push(file);

    for (const target of graph.get(file) ?? []) {
      visit(target);
    }

    stack.pop();
    visiting.delete(file);
    visited.add(file);
  };

  for (const file of graph.keys()) {
    visit(file);
  }

  return [...cycles].sort();
}

function listTypeScriptFiles(root: string): string[] {
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
      files.push(...listTypeScriptFiles(path));
      continue;
    }

    if (entry.isFile() && path.endsWith(".ts") && statSync(path).isFile()) {
      files.push(path);
    }
  }

  return files;
}
