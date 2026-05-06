import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

import {
  ALLOWED_LAYERING,
  PACKAGE_NAMES,
  findAllowedLayeringCycles,
  formatWorkspaceDependency,
  isWorkspacePackageName,
  parseWorkspaceDependencySpecifier,
  readDeclaredWorkspaceDependencyNames,
  type PackageName,
} from "../../scripts/package-graph.ts";

const REPO_ROOT = process.cwd();

for (const packageName of PACKAGE_NAMES) {
  test(`${packageName} only uses declared workspace dependencies`, () => {
    const declaredDependencies = new Set(readDeclaredWorkspaceDependencyNames(REPO_ROOT, packageName));
    const violations = collectWorkspaceImports(packageName)
      .flatMap((usage) => {
        if (usage.targetPackage === packageName) {
          return [];
        }

        if (!isWorkspacePackageName(usage.targetPackage)) {
          return [
            `${packageName} imports unknown workspace package ${formatWorkspaceDependency(usage.targetPackage)} in ${usage.location}`,
          ];
        }

        if (declaredDependencies.has(usage.targetPackage)) {
          return [];
        }

        return [
          `${packageName} uses undeclared ${formatWorkspaceDependency(usage.targetPackage)} in ${usage.location}`,
        ];
      })
      .sort();

    expect(violations).toEqual([]);
  });

  test(`${packageName} only declares allowed workspace dependencies`, () => {
    const allowedDependencies = new Set(ALLOWED_LAYERING[packageName]);
    const violations = readDeclaredWorkspaceDependencyNames(REPO_ROOT, packageName)
      .flatMap((dependency) => {
        if (!isWorkspacePackageName(dependency)) {
          return [
            `${packageName} declares unknown workspace package ${formatWorkspaceDependency(dependency)} in packages/${packageName}/package.json`,
          ];
        }

        if (allowedDependencies.has(dependency)) {
          return [];
        }

        return [
          `${packageName} declares disallowed ${formatWorkspaceDependency(dependency)} in packages/${packageName}/package.json; allowed: ${formatDependencyList(ALLOWED_LAYERING[packageName])}`,
        ];
      })
      .sort();

    expect(violations).toEqual([]);
  });
}

test("allowed workspace layering graph is acyclic", () => {
  expect(findAllowedLayeringCycles()).toEqual([]);
});

type WorkspaceImportUsage = {
  location: string;
  targetPackage: string;
};

function collectWorkspaceImports(packageName: PackageName): WorkspaceImportUsage[] {
  const packageRoot = join(REPO_ROOT, "packages", packageName);
  const files = [
    ...listTypeScriptFilesIn(join(packageRoot, "src")),
    ...listTypeScriptFilesIn(join(packageRoot, "tests")),
  ];

  const usages: WorkspaceImportUsage[] = [];
  for (const path of files) {
    const source = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const relativePath = relative(REPO_ROOT, path).replaceAll("\\", "/");

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const dependency = parseWorkspaceDependencySpecifier(node.moduleSpecifier.text);
        if (dependency !== null) {
          usages.push({
            location: formatLocation(relativePath, sourceFile, node.moduleSpecifier.getStart(sourceFile)),
            targetPackage: dependency,
          });
        }
      }

      const importArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined;
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        importArgument !== undefined &&
        ts.isStringLiteralLike(importArgument)
      ) {
        const dependency = parseWorkspaceDependencySpecifier(importArgument.text);
        if (dependency !== null) {
          usages.push({
            location: formatLocation(relativePath, sourceFile, importArgument.getStart(sourceFile)),
            targetPackage: dependency,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return usages.sort((left, right) => left.location.localeCompare(right.location) || left.targetPackage.localeCompare(right.targetPackage));
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

  return files.sort((left, right) => relative(REPO_ROOT, left).localeCompare(relative(REPO_ROOT, right)));
}

function formatDependencyList(packageNames: readonly PackageName[]): string {
  return packageNames.length === 0 ? "(none)" : packageNames.map(formatWorkspaceDependency).join(", ");
}

function formatLocation(relativePath: string, sourceFile: ts.SourceFile, position: number): string {
  const { line } = sourceFile.getLineAndCharacterOfPosition(position);
  return `${relativePath}:${line + 1}`;
}
