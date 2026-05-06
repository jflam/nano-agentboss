import { spawn } from "node:child_process";
import { join, relative } from "node:path";

import {
  computeReverseDependencyClosure,
  isWorkspacePackageName,
  type PackageName,
} from "./package-graph.ts";

export type ValidationPlanKind = "none" | "commands" | "full-precommit";

export interface ValidationCommand {
  label: string;
  argv: string[];
  cwd?: string;
  reasons: string[];
}

export interface ValidationPlan {
  kind: ValidationPlanKind;
  changedPaths: string[];
  commands: ValidationCommand[];
  reasons: string[];
}

interface MutableSelection {
  packageTypechecks: Map<PackageName, string[]>;
  packageTests: Map<PackageName, string[]>;
  packageTestFiles: Map<PackageName, Map<string, string[]>>;
  rootUnitTests: Map<string, string[]>;
  e2eTests: Map<string, string[]>;
  reasons: string[];
  fallbackReasons: string[];
  sawCodeAffectingPath: boolean;
}

const ROOT_CONFIG_PATHS = new Set([
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "tsconfig.json",
  "eslint.config.js",
  "eslint.config.ts",
  "knip.json",
]);

const ROOT_ARCHITECTURE_TESTS = [
  "tests/unit/package-dependency-direction.test.ts",
  "tests/unit/package-import-cycles.test.ts",
  "tests/unit/public-package-entrypoints.test.ts",
  "tests/unit/root-test-boundary.test.ts",
] as const;

const SCRIPT_UNIT_TESTS: Record<string, readonly string[]> = {
  "scripts/precommit-check.ts": ["tests/unit/pre-commit-checks.test.ts"],
  "scripts/compact-test.ts": ["tests/unit/compact-test.test.ts"],
  "scripts/run-package-task.ts": ["tests/unit/package-dependency-direction.test.ts"],
  "scripts/package-graph.ts": ["tests/unit/package-dependency-direction.test.ts", "tests/unit/validate-changed.test.ts"],
  "scripts/validate-changed.ts": ["tests/unit/validate-changed.test.ts"],
  "scripts/validate-changed-lib.ts": ["tests/unit/validate-changed.test.ts"],
};

const ROOT_COMMAND_TESTS: Record<string, readonly string[]> = {
  "nanoboss.ts": ["tests/unit/nanoboss.test.ts", "tests/unit/cli-options.test.ts"],
  "cli.ts": ["tests/unit/cli-options.test.ts", "tests/unit/argv.test.ts"],
  "resume.ts": ["tests/unit/resume.test.ts", "tests/unit/resume-options.test.ts"],
  "src/commands/doctor.ts": ["tests/unit/doctor.test.ts"],
  "src/commands/http.ts": ["tests/unit/http-server-options.test.ts"],
  "src/commands/http-options.ts": ["tests/unit/http-server-options.test.ts"],
};

export function selectValidationPlan(changedPaths: readonly string[], repoRoot = process.cwd()): ValidationPlan {
  const normalizedPaths = [...new Set(changedPaths.map(normalizePath).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));

  const selection: MutableSelection = {
    packageTypechecks: new Map(),
    packageTests: new Map(),
    packageTestFiles: new Map(),
    rootUnitTests: new Map(),
    e2eTests: new Map(),
    reasons: [],
    fallbackReasons: [],
    sawCodeAffectingPath: false,
  };

  for (const path of normalizedPaths) {
    classifyPath(path, repoRoot, selection);
  }

  if (selection.fallbackReasons.length > 0) {
    return {
      kind: "full-precommit",
      changedPaths: normalizedPaths,
      reasons: selection.fallbackReasons,
      commands: [{
        label: "full pre-commit",
        argv: ["bun", "run", "check:precommit"],
        reasons: selection.fallbackReasons,
      }],
    };
  }

  const commands = buildCommands(selection);
  if (!selection.sawCodeAffectingPath && commands.length === 0) {
    return {
      kind: "none",
      changedPaths: normalizedPaths,
      commands: [],
      reasons: normalizedPaths.length === 0
        ? ["no changed files detected"]
        : ["docs/plans-only changes do not require code validation"],
    };
  }

  return {
    kind: commands.length === 0 ? "none" : "commands",
    changedPaths: normalizedPaths,
    commands,
    reasons: selection.reasons,
  };
}

export function formatValidationPlan(plan: ValidationPlan): string {
  if (plan.kind === "none") {
    return [
      "validate:changed selected no code validation.",
      ...plan.reasons.map((reason) => `- ${reason}`),
    ].join("\n");
  }

  const lines = [
    plan.kind === "full-precommit"
      ? "validate:changed selected the full pre-commit gate."
      : "validate:changed selected scoped checks.",
  ];

  for (const command of plan.commands) {
    lines.push(`- ${formatCommand(command)}`);
    for (const reason of command.reasons) {
      lines.push(`  reason: ${reason}`);
    }
  }

  return lines.join("\n");
}

export async function runValidationPlan(plan: ValidationPlan, repoRoot = process.cwd()): Promise<number> {
  if (plan.kind === "none") {
    return 0;
  }

  for (const command of plan.commands) {
    const exitCode = await runCommand(command, repoRoot);
    if (exitCode !== 0) {
      return exitCode;
    }
  }

  return 0;
}

export function collectChangedPaths(repoRoot = process.cwd()): string[] {
  return [
    ...runGitNameOnly(repoRoot, ["diff", "--name-only", "--cached"]),
    ...runGitNameOnly(repoRoot, ["diff", "--name-only"]),
    ...runGitNameOnly(repoRoot, ["ls-files", "--others", "--exclude-standard"]),
  ];
}

function classifyPath(path: string, repoRoot: string, selection: MutableSelection): void {
  if (isDocsOnlyPath(path)) {
    selection.reasons.push(`${path}: docs/plans-only path`);
    return;
  }

  if (ROOT_CONFIG_PATHS.has(path)) {
    selection.fallbackReasons.push(`${path}: root package/config/build-system change requires full pre-commit`);
    return;
  }

  if (path.startsWith("packages/")) {
    classifyPackagePath(path, repoRoot, selection);
    return;
  }

  if (path.startsWith("tests/unit/") && path.endsWith(".test.ts")) {
    selection.sawCodeAffectingPath = true;
    addRootUnitTest(selection, path, `${path}: changed root unit test`);
    return;
  }

  if (path.startsWith("tests/e2e/") && path.endsWith(".test.ts")) {
    selection.sawCodeAffectingPath = true;
    addE2eTest(selection, path, `${path}: changed e2e test`);
    return;
  }

  if (path.startsWith("procedures/nanoboss/")) {
    selection.sawCodeAffectingPath = true;
    for (const testPath of testsForNanobossProcedure(path)) {
      addRootUnitTest(selection, testPath, `${path}: nanoboss procedure support change`);
    }
    return;
  }

  const scriptTests = SCRIPT_UNIT_TESTS[path];
  if (scriptTests) {
    selection.sawCodeAffectingPath = true;
    for (const testPath of scriptTests) {
      addRootUnitTest(selection, testPath, `${path}: validation script change`);
    }
    return;
  }

  const commandTests = ROOT_COMMAND_TESTS[path];
  if (commandTests) {
    selection.sawCodeAffectingPath = true;
    for (const testPath of commandTests) {
      addRootUnitTest(selection, testPath, `${path}: root command change`);
    }
    return;
  }

  if (path.startsWith("src/commands/")) {
    selection.sawCodeAffectingPath = true;
    addRootUnitTest(selection, "tests/unit/cli-options.test.ts", `${path}: root command surface change`);
    return;
  }

  selection.fallbackReasons.push(`${path}: changed path is not covered by validate:changed mapping`);
}

function classifyPackagePath(path: string, repoRoot: string, selection: MutableSelection): void {
  const parts = path.split("/");
  const packageName = parts[1];
  if (!packageName || !isWorkspacePackageName(packageName)) {
    selection.fallbackReasons.push(`${path}: unknown workspace package`);
    return;
  }

  selection.sawCodeAffectingPath = true;
  const packageRelativePath = parts.slice(2).join("/");

  if (packageRelativePath.startsWith("tests/") && path.endsWith(".test.ts")) {
    addPackageTestFile(selection, packageName, packageRelativePath, `${path}: changed package test file`);
    return;
  }

  if (isPackagePublicSurface(packageRelativePath)) {
    const impactedPackages = computeReverseDependencyClosure(repoRoot, [packageName]);
    for (const impactedPackage of impactedPackages) {
      addPackageTypecheck(selection, impactedPackage, `${path}: public package surface impacts ${impactedPackage}`);
      addPackageTest(selection, impactedPackage, `${path}: public package surface impacts ${impactedPackage}`);
    }
    for (const testPath of ROOT_ARCHITECTURE_TESTS) {
      addRootUnitTest(selection, testPath, `${path}: package public/config boundary change`);
    }
    return;
  }

  if (packageRelativePath.startsWith("src/")) {
    addPackageTypecheck(selection, packageName, `${path}: package source change`);
    addPackageTest(selection, packageName, `${path}: package source change`);
    addIntegrationRiskTests(path, selection);
    return;
  }

  selection.fallbackReasons.push(`${path}: package path is not covered by validate:changed mapping`);
}

function buildCommands(selection: MutableSelection): ValidationCommand[] {
  const commands: ValidationCommand[] = [];
  const packagesWithFullTests = new Set(selection.packageTests.keys());

  for (const [packageName, reasons] of sortedMapEntries(selection.packageTypechecks)) {
    commands.push({
      label: `${packageName} typecheck`,
      argv: ["bun", "run", "typecheck"],
      cwd: `packages/${packageName}`,
      reasons,
    });
  }

  for (const [packageName, reasons] of sortedMapEntries(selection.packageTests)) {
    commands.push({
      label: `${packageName} tests`,
      argv: ["bun", "test"],
      cwd: `packages/${packageName}`,
      reasons,
    });
  }

  for (const [packageName, files] of sortedMapEntries(selection.packageTestFiles)) {
    if (packagesWithFullTests.has(packageName)) {
      continue;
    }

    for (const [file, reasons] of sortedMapEntries(files)) {
      commands.push({
        label: `${packageName} test ${file}`,
        argv: ["bun", "test", file],
        cwd: `packages/${packageName}`,
        reasons,
      });
    }
  }

  if (selection.rootUnitTests.size > 0) {
    const testFiles = sortedKeys(selection.rootUnitTests);
    commands.push({
      label: "root unit tests",
      argv: ["bun", "run", "scripts/compact-test.ts", ...testFiles],
      reasons: collectReasons(selection.rootUnitTests, testFiles),
    });
  }

  if (selection.e2eTests.size > 0) {
    const testFiles = sortedKeys(selection.e2eTests);
    commands.push({
      label: "selected e2e tests",
      argv: ["bun", "run", "scripts/compact-test.ts", ...testFiles],
      reasons: collectReasons(selection.e2eTests, testFiles),
    });
  }

  return commands;
}

function addIntegrationRiskTests(path: string, selection: MutableSelection): void {
  if (path.startsWith("packages/adapters-http/src/server")
    || path.startsWith("packages/adapters-http/src/sse-stream")
    || path.startsWith("packages/adapters-http/src/private-server")
    || path.startsWith("packages/adapters-http/src/server-supervisor")) {
    addE2eTest(selection, "tests/e2e/http-sse.test.ts", `${path}: HTTP integration-sensitive path`);
    addE2eTest(selection, "tests/e2e/http-server-supervisor.test.ts", `${path}: HTTP supervisor integration-sensitive path`);
  }

  if (path.startsWith("packages/adapters-acp-server/src/")) {
    addE2eTest(selection, "tests/e2e/typed.test.ts", `${path}: ACP server integration-sensitive path`);
  }

  if (path.startsWith("packages/app-runtime/src/session-runtime")
    || path.startsWith("packages/app-runtime/src/runtime-service")
    || path.startsWith("packages/app-runtime/src/prompt-run")) {
    addE2eTest(selection, "tests/e2e/default-history-agents.test.ts", `${path}: runtime integration-sensitive path`);
  }

  if (path.startsWith("packages/procedure-engine/src/dispatch/")) {
    addRootUnitTest(selection, "tests/unit/procedure-dispatch-jobs.test.ts", `${path}: procedure dispatch runtime path`);
    addE2eTest(selection, "tests/e2e/procedure-dispatch-recovery.test.ts", `${path}: procedure dispatch recovery path`);
  }
}

function testsForNanobossProcedure(path: string): readonly string[] {
  if (path.includes("pre-commit-checks") || path.includes("test-cache-lib") || path.includes("commit")) {
    return ["tests/unit/pre-commit-checks.test.ts"];
  }

  if (path.includes("compact-test-cache")) {
    return ["tests/unit/compact-test.test.ts"];
  }

  return ["tests/unit/pre-commit-checks.test.ts"];
}

function isDocsOnlyPath(path: string): boolean {
  return path === "README.md"
    || path.startsWith("docs/")
    || path.startsWith("plans/")
    || path.endsWith(".md") && !path.startsWith("packages/");
}

function isPackagePublicSurface(packageRelativePath: string): boolean {
  return packageRelativePath === "package.json"
    || packageRelativePath === "tsconfig.json"
    || packageRelativePath.startsWith("tsconfig.")
    || packageRelativePath === "src/index.ts"
    || packageRelativePath.endsWith(".d.ts");
}

function addPackageTypecheck(selection: MutableSelection, packageName: PackageName, reason: string): void {
  addMapReason(selection.packageTypechecks, packageName, reason);
}

function addPackageTest(selection: MutableSelection, packageName: PackageName, reason: string): void {
  addMapReason(selection.packageTests, packageName, reason);
}

function addPackageTestFile(selection: MutableSelection, packageName: PackageName, file: string, reason: string): void {
  let files = selection.packageTestFiles.get(packageName);
  if (!files) {
    files = new Map();
    selection.packageTestFiles.set(packageName, files);
  }
  addMapReason(files, file, reason);
}

function addRootUnitTest(selection: MutableSelection, testPath: string, reason: string): void {
  addMapReason(selection.rootUnitTests, testPath, reason);
}

function addE2eTest(selection: MutableSelection, testPath: string, reason: string): void {
  addMapReason(selection.e2eTests, testPath, reason);
}

function addMapReason<TKey>(map: Map<TKey, string[]>, key: TKey, reason: string): void {
  const reasons = map.get(key) ?? [];
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
  map.set(key, reasons);
}

function sortedMapEntries<TKey extends string, TValue>(map: Map<TKey, TValue>): Array<[TKey, TValue]> {
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function sortedKeys(map: Map<string, unknown>): string[] {
  return [...map.keys()].sort((left, right) => left.localeCompare(right));
}

function collectReasons(map: Map<string, string[]>, keys: string[]): string[] {
  return keys.flatMap((key) => map.get(key) ?? []);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function formatCommand(command: ValidationCommand): string {
  const prefix = command.cwd ? `(cd ${command.cwd} && ` : "";
  const suffix = command.cwd ? ")" : "";
  return `${prefix}${command.argv.join(" ")}${suffix}`;
}

async function runCommand(command: ValidationCommand, repoRoot: string): Promise<number> {
  const [bin, ...args] = command.argv;
  if (!bin) {
    throw new Error(`Missing command binary for ${command.label}`);
  }

  const child = spawn(bin, args, {
    cwd: command.cwd ? join(repoRoot, command.cwd) : repoRoot,
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  return await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

function runGitNameOnly(repoRoot: string, args: string[]): string[] {
  const result = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${new TextDecoder().decode(result.stderr).trim()}`);
  }

  return new TextDecoder()
    .decode(result.stdout)
    .split(/\r?\n/)
    .map((path) => relative(repoRoot, join(repoRoot, path)).replaceAll("\\", "/"))
    .filter(Boolean);
}
