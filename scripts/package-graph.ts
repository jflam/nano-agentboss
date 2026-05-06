import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export const PACKAGE_SCOPE = "@nanoboss/";

export const PACKAGE_NAMES = [
  "adapters-acp-server",
  "adapters-http",
  "adapters-mcp",
  "adapters-tui",
  "agent-acp",
  "app-runtime",
  "app-support",
  "contracts",
  "procedure-catalog",
  "procedure-engine",
  "procedure-sdk",
  "store",
  "tui-extension-catalog",
  "tui-extension-sdk",
] as const;

export type PackageName = (typeof PACKAGE_NAMES)[number];

export const ALLOWED_LAYERING: Record<PackageName, readonly PackageName[]> = {
  "adapters-acp-server": [
    "agent-acp",
    "adapters-mcp",
    "app-runtime",
    "app-support",
    "contracts",
    "procedure-engine",
  ],
  "adapters-http": ["agent-acp", "app-runtime", "app-support", "procedure-sdk"],
  "adapters-mcp": ["app-runtime", "app-support", "contracts", "procedure-sdk", "store"],
  "adapters-tui": [
    "adapters-http",
    "agent-acp",
    "app-support",
    "contracts",
    "procedure-engine",
    "procedure-sdk",
    "store",
    "tui-extension-catalog",
    "tui-extension-sdk",
  ],
  "agent-acp": ["app-support", "contracts", "procedure-sdk", "store"],
  "app-runtime": [
    "agent-acp",
    "app-support",
    "contracts",
    "procedure-catalog",
    "procedure-engine",
    "procedure-sdk",
    "store",
  ],
  "app-support": [],
  contracts: [],
  "procedure-catalog": ["app-support", "procedure-sdk"],
  "procedure-engine": ["agent-acp", "app-support", "contracts", "procedure-catalog", "procedure-sdk", "store"],
  "procedure-sdk": ["contracts"],
  store: ["app-support", "contracts", "procedure-sdk"],
  "tui-extension-catalog": ["app-support", "tui-extension-sdk"],
  "tui-extension-sdk": ["procedure-sdk"],
};

interface PackageManifest {
  name?: string;
  dependencies?: Record<string, string>;
}

export interface WorkspacePackage {
  name: PackageName;
  packageName: string;
  dir: string;
  manifestPath: string;
  declaredWorkspaceDependencies: readonly PackageName[];
}

export function listWorkspacePackages(repoRoot = process.cwd()): WorkspacePackage[] {
  const packagesRoot = join(repoRoot, "packages");
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name): name is PackageName => isWorkspacePackageName(name))
    .map((name) => readWorkspacePackage(repoRoot, name))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function readWorkspacePackage(repoRoot: string, packageName: PackageName): WorkspacePackage {
  const dir = join(repoRoot, "packages", packageName);
  const manifestPath = join(dir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  return {
    name: packageName,
    packageName: manifest.name ?? `${PACKAGE_SCOPE}${basename(dir)}`,
    dir,
    manifestPath,
    declaredWorkspaceDependencies: readDeclaredWorkspaceDependencies(repoRoot, packageName),
  };
}

export function readDeclaredWorkspaceDependencies(repoRoot: string, packageName: PackageName): PackageName[] {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "packages", packageName, "package.json"), "utf8"),
  ) as PackageManifest;

  return Object.keys(packageJson.dependencies ?? {})
    .flatMap((specifier) => {
      const dependency = parseWorkspaceDependencySpecifier(specifier);
      return dependency !== null && dependency !== packageName && isWorkspacePackageName(dependency)
        ? [dependency]
        : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

export function readDeclaredWorkspaceDependencyNames(repoRoot: string, packageName: PackageName): string[] {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "packages", packageName, "package.json"), "utf8"),
  ) as PackageManifest;

  return Object.keys(packageJson.dependencies ?? {})
    .flatMap((specifier) => {
      const dependency = parseWorkspaceDependencySpecifier(specifier);
      return dependency !== null && dependency !== packageName ? [dependency] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

export function computeReverseDependencyClosure(
  repoRoot: string,
  packageNames: Iterable<PackageName>,
): PackageName[] {
  const selected = new Set(packageNames);
  let changed = true;

  while (changed) {
    changed = false;
    for (const packageName of PACKAGE_NAMES) {
      if (selected.has(packageName)) {
        continue;
      }

      const dependencies = readDeclaredWorkspaceDependencies(repoRoot, packageName);
      if (dependencies.some((dependency) => selected.has(dependency))) {
        selected.add(packageName);
        changed = true;
      }
    }
  }

  return [...selected].sort((left, right) => left.localeCompare(right));
}

export function findAllowedLayeringCycles(): string[] {
  const visited = new Set<PackageName>();
  const inStack = new Set<PackageName>();
  const stack: PackageName[] = [];
  const cycles = new Set<string>();

  const visit = (packageName: PackageName): void => {
    if (inStack.has(packageName)) {
      const cycleStartIndex = stack.indexOf(packageName);
      const cyclePath = [...stack.slice(cycleStartIndex), packageName]
        .map(formatWorkspaceDependency)
        .join(" -> ");
      cycles.add(cyclePath);
      return;
    }

    if (visited.has(packageName)) {
      return;
    }

    visited.add(packageName);
    inStack.add(packageName);
    stack.push(packageName);

    for (const dependency of ALLOWED_LAYERING[packageName]) {
      visit(dependency);
    }

    stack.pop();
    inStack.delete(packageName);
  };

  for (const packageName of PACKAGE_NAMES) {
    visit(packageName);
  }

  return [...cycles].sort();
}

export function listPackageDirectories(repoRoot = process.cwd()): string[] {
  const packagesRoot = join(repoRoot, "packages");
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name))
    .filter((packageDir) => existsSync(join(packageDir, "package.json")))
    .sort((left, right) => basename(left).localeCompare(basename(right)));
}

export function parseWorkspaceDependencySpecifier(specifier: string): string | null {
  if (!specifier.startsWith(PACKAGE_SCOPE)) {
    return null;
  }

  const dependency = specifier.slice(PACKAGE_SCOPE.length).split("/")[0];
  return dependency && dependency.length > 0 ? dependency : null;
}

export function isWorkspacePackageName(value: string): value is PackageName {
  return (PACKAGE_NAMES as readonly string[]).includes(value);
}

export function formatWorkspaceDependency(packageName: string): string {
  return `${PACKAGE_SCOPE}${packageName}`;
}
