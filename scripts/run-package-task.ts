import { basename, join } from "node:path";

import { listPackageDirectories } from "./package-graph.ts";

interface PackageManifest {
  name?: string;
  scripts?: Record<string, string | undefined>;
}

interface PackageTaskFailure {
  name: string;
  output: string;
}

const task = process.argv[2];

if (!task) {
  console.error("Usage: bun run scripts/run-package-task.ts <task>");
  process.exit(1);
}
const taskName = task;

const packageDirs = listPackageDirectories(process.cwd());

const concurrency = Math.min(
  packageDirs.length,
  Math.max(1, Number(process.env.NANOBOSS_PACKAGE_TASK_CONCURRENCY ?? "4") || 4),
);
const failures: PackageTaskFailure[] = [];
let completed = 0;
let nextIndex = 0;

console.log(`Running "${taskName}" in ${packageDirs.length} packages with concurrency ${concurrency}.`);

async function runPackageTask(packageDir: string): Promise<void> {
  const manifest = await Bun.file(join(packageDir, "package.json")).json() as PackageManifest;
  const name = manifest.name ?? basename(packageDir);
  const startedAt = performance.now();

  if (!manifest.scripts?.[taskName]) {
    failures.push({
      name,
      output: `Missing scripts.${taskName} in ${join(packageDir, "package.json")}`,
    });
    console.log(`[${name}] missing script ${formatDuration(performance.now() - startedAt)}`);
    return;
  }

  console.log(`[${name}] starting`);

  const processHandle = Bun.spawn({
    cmd: ["bun", "run", taskName],
    cwd: packageDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ]);

  if (exitCode === 0) {
    completed += 1;
    console.log(`[${name}] ok ${formatDuration(performance.now() - startedAt)}`);
    return;
  }

  failures.push({
    name,
    output: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n"),
  });
  console.log(`[${name}] failed ${formatDuration(performance.now() - startedAt)}`);
}

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (nextIndex < packageDirs.length) {
      const packageDir = packageDirs[nextIndex];
      if (!packageDir) {
        throw new Error(`Missing package directory at index ${nextIndex}`);
      }
      nextIndex += 1;
      await runPackageTask(packageDir);
    }
  }),
);

if (failures.length > 0) {
  console.error(`\n${failures.length} package task${failures.length === 1 ? "" : "s"} failed for "${taskName}".`);
  for (const failure of failures) {
    console.error(`\n[${failure.name}]`);
    if (failure.output.length > 0) {
      console.error(failure.output);
    }
  }
  process.exit(1);
}

console.log(`Completed "${taskName}" in ${completed} packages.`);

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${(durationMs / 1_000).toFixed(1)}s`;
}
