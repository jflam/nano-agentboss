import { isAbsolute, relative, resolve } from "node:path";

import typia from "typia";

import { expectData } from "../src/core/run-result.ts";
import { jsonType } from "../src/core/types.ts";
import type {
  CommandContext,
  Procedure,
} from "../src/core/types.ts";

export interface LinterError {
  file: string;
  line: number;
  column: number;
  message: string;
  rule: string;
}

export interface LintExecutionPlan {
  cwd: string;
  executable: string;
  args: string[];
  parser: "eslint-json";
}

interface FileErrorGroup {
  normalizedFile: string;
  displayFile: string;
  errors: LinterError[];
}

interface LinterDiscoveryResult {
  status: "configured" | "missing_linter";
  summary: string;
  errors: LinterError[];
  recommendations: string[];
  plan: LintExecutionPlan | null;
}

interface LintRunResult {
  status: "configured" | "missing_linter";
  summary: string;
  errors: LinterError[];
  recommendations: string[];
  command: string | null;
}

interface EslintJsonMessage {
  line?: number;
  column?: number;
  message?: string;
  ruleId?: string | null;
  severity?: number;
}

const LinterDiscoveryResultType = jsonType<LinterDiscoveryResult>(
  typia.json.schema<LinterDiscoveryResult>(),
  typia.createValidate<LinterDiscoveryResult>(),
);

const MAX_ROUNDS = 3;
const MAX_FILES_PER_ROUND = 3;
const textDecoder = new TextDecoder();

function renderRecommendations(recommendations: string[]): string {
  if (recommendations.length === 0) {
    return "";
  }

  return recommendations.map((item) => `- ${item}`).join("\n");
}

function normalizeErrorFile(cwd: string, file: string): string {
  return isAbsolute(file) ? file : resolve(cwd, file);
}

function displayErrorFile(cwd: string, file: string): string {
  const relativePath = relative(cwd, file);
  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)
    ? relativePath
    : file;
}

function renderCommand(plan: LintExecutionPlan): string {
  return [plan.executable, ...plan.args].join(" ");
}

function decodeProcessText(output: Uint8Array): string {
  return textDecoder.decode(output).trim();
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function groupErrorsByFile(cwd: string, errors: LinterError[]): FileErrorGroup[] {
  const groups = new Map<string, FileErrorGroup>();

  for (const error of errors) {
    const normalizedFile = normalizeErrorFile(cwd, error.file);
    const existing = groups.get(normalizedFile);

    if (existing) {
      existing.errors.push(error);
      continue;
    }

    groups.set(normalizedFile, {
      normalizedFile,
      displayFile: displayErrorFile(cwd, normalizedFile),
      errors: [error],
    });
  }

  return Array.from(groups.values());
}

export function selectFixWave(fileGroups: FileErrorGroup[], limit: number): FileErrorGroup[] {
  return fileGroups.slice(0, limit);
}

export function buildFixPrompt(group: FileErrorGroup): string {
  const diagnostics = group.errors.map((error) =>
    `- ${group.displayFile}:${error.line}:${error.column} ${error.message} (rule: ${error.rule})`
  );

  return [
    `Fix only the following linter errors in ${group.normalizedFile}:`,
    ...diagnostics,
    `Prefer editing only ${group.normalizedFile}.`,
    "Do not run the full repo linter or any repo-wide lint command.",
    "Do not search for or fix unrelated lint errors in other files.",
    "Do not run build or tests unless they are strictly necessary for this targeted file fix.",
    "Do not commit changes.",
    "The caller will rerun lint and manage commits after you return.",
    "Reply briefly with what you changed.",
  ].join("\n");
}

function buildDiscoveryPrompt(cwd: string, prompt: string): string {
  return [
    `Inspect the repo at ${cwd} and determine whether an existing linter can be run in machine-readable JSON mode.`,
    "Check existing scripts and linter config if needed, but do not install or configure anything.",
    "If a linter is runnable, actually run it once and return normalized lint errors from that run.",
    "If a linter is runnable, also return a reusable `plan` object with:",
    "- `cwd`: the absolute working directory to run from",
    "- `executable`: the direct executable to invoke",
    "- `args`: the exact argv needed to rerun the linter in JSON mode",
    "- `parser`: currently only `eslint-json` is supported",
    "The plan must avoid shell operators, pipes, command substitution, and inline environment-variable assignments.",
    "If you cannot express the runnable linter in this schema, return status `missing_linter` with a short complaint and 1-3 concrete recommendations.",
    "If the linter runs successfully with zero errors, return status `configured` with an empty errors array and a valid plan.",
    `Additional user instructions: ${prompt || "none"}`,
  ].join("\n\n");
}

function findErrorGroup(
  cwd: string,
  errors: LinterError[],
  normalizedFile: string,
): FileErrorGroup | undefined {
  return groupErrorsByFile(cwd, errors).find((group) => group.normalizedFile === normalizedFile);
}

async function discoverLinter(
  ctx: CommandContext,
  prompt: string,
): Promise<LinterDiscoveryResult> {
  const result = await ctx.callAgent(
    buildDiscoveryPrompt(ctx.cwd, prompt),
    LinterDiscoveryResultType,
    { stream: false },
  );

  return expectData(result, "Linter discovery returned no data");
}

function parseEslintJsonMessage(
  cwd: string,
  filePath: string,
  message: EslintJsonMessage,
): LinterError | null {
  if ((message.severity ?? 0) < 2) {
    return null;
  }

  return {
    file: normalizeErrorFile(cwd, filePath),
    line: message.line ?? 0,
    column: message.column ?? 0,
    message: message.message ?? "Unknown lint error",
    rule: message.ruleId ?? "parsing",
  };
}

export function parseEslintJsonOutput(cwd: string, output: string): LinterError[] {
  if (output.trim().length === 0) {
    throw new Error("Expected JSON output from the discovered linter command, but stdout was empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `Failed to parse ESLint JSON output: ${formatErrorMessage(error)}`,
      { cause: error },
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Expected ESLint JSON output to be an array");
  }

  const errors: LinterError[] = [];
  for (const entry of parsed) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const filePath = typeof record.filePath === "string"
      ? record.filePath
      : undefined;
    if (!filePath) {
      continue;
    }

    const messages = Array.isArray(record.messages)
      ? record.messages
      : [];
    for (const message of messages) {
      const normalized = parseEslintJsonMessage(cwd, filePath, message as EslintJsonMessage);
      if (normalized) {
        errors.push(normalized);
      }
    }
  }

  return errors;
}

function runPlannedLinter(plan: LintExecutionPlan): LintRunResult {
  let result: Bun.SyncSubprocess;
  try {
    result = Bun.spawnSync({
      cmd: [plan.executable, ...plan.args],
      cwd: plan.cwd,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw new Error(
      `Failed to start discovered linter command \`${renderCommand(plan)}\`: ${formatErrorMessage(error)}`,
      { cause: error },
    );
  }

  const stdout = decodeProcessText(result.stdout);
  const stderr = decodeProcessText(result.stderr);

  const errors = parseEslintJsonOutput(plan.cwd, stdout);

  if (result.exitCode !== 0 && result.exitCode !== 1 && errors.length === 0) {
    const details = [stdout, stderr].filter((value) => value.length > 0).join("\n");
    throw new Error(
      `Discovered linter command \`${renderCommand(plan)}\` failed with exit code ${result.exitCode}${details ? `: ${details}` : ""}`,
    );
  }

  return {
    status: "configured",
    summary: errors.length === 0 ? "Lint command ran cleanly." : `Found ${pluralize(errors.length, "error")}.`,
    errors,
    recommendations: [],
    command: renderCommand(plan),
  };
}

function buildMissingLinterResult(linter: LintRunResult, fixedErrors: number) {
  const recommendations = renderRecommendations(linter.recommendations);

  return {
    data: buildSummaryData(linter, fixedErrors),
    display: `${linter.summary}\n${recommendations ? `${recommendations}\n` : ""}`,
    summary: linter.summary,
  };
}

function buildSummaryData(linter: LintRunResult, fixedErrors: number) {
  return {
    status: linter.status,
    command: linter.command,
    fixedErrors,
    remainingErrors: linter.errors.length,
  };
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export default {
  name: "linter",
  description: "Fix all linter errors in the project",
  inputHint: "Optional focus area or instructions",
  async execute(prompt, ctx) {
    let fixedErrors = 0;

    ctx.print("Starting linter workflow...\n");
    const discovery = await discoverLinter(ctx, prompt);

    if (discovery.status === "missing_linter" || !discovery.plan) {
      ctx.print("No runnable linter found.\n");
      return buildMissingLinterResult(
        {
          status: discovery.status,
          summary: discovery.summary,
          errors: discovery.errors,
          recommendations: discovery.recommendations,
          command: discovery.plan ? renderCommand(discovery.plan) : null,
        },
        fixedErrors,
      );
    }

    let linter: LintRunResult = {
      status: discovery.status,
      summary: discovery.summary,
      errors: discovery.errors,
      recommendations: discovery.recommendations,
      command: renderCommand(discovery.plan),
    };

    const initialGroups = groupErrorsByFile(ctx.cwd, linter.errors);
    ctx.print(
      `Using \`${linter.command}\`. Found ${pluralize(linter.errors.length, "error")} across ${pluralize(initialGroups.length, "file")}.\n`,
    );

    if (linter.errors.length === 0) {
      ctx.print("Repo is already lint-clean.\n");
      return {
        data: buildSummaryData(linter, fixedErrors),
        display: `Linter command \`${linter.command}\` ran cleanly. ${linter.summary}\n`,
        summary: `linter: clean (${linter.command})`,
      };
    }

    for (let round = 0; round < MAX_ROUNDS && linter.errors.length > 0; round += 1) {
      const allGroups = groupErrorsByFile(ctx.cwd, linter.errors);
      const wave = selectFixWave(allGroups, MAX_FILES_PER_ROUND);

      ctx.print(
        `Round ${round + 1}/${MAX_ROUNDS}: ${pluralize(linter.errors.length, "error")} across ${pluralize(allGroups.length, "file")}.\n`,
      );

      for (const fileGroup of wave) {
        ctx.print(`Fixing ${pluralize(fileGroup.errors.length, "error")} in \`${fileGroup.displayFile}\`...\n`);
        await ctx.callAgent(buildFixPrompt(fileGroup), { stream: false });
      }

      const rerun = runPlannedLinter(discovery.plan);
      const resolvedThisRound = Math.max(0, linter.errors.length - rerun.errors.length);
      let resolvedInTargetedFiles = 0;

      for (const fileGroup of wave) {
        const afterCount = findErrorGroup(
          ctx.cwd,
          rerun.errors,
          fileGroup.normalizedFile,
        )?.errors.length ?? 0;
        const resolvedCount = Math.max(0, fileGroup.errors.length - afterCount);

        if (resolvedCount === 0) {
          ctx.print(`No progress in \`${fileGroup.displayFile}\`.\n`);
          continue;
        }

        resolvedInTargetedFiles += resolvedCount;
        ctx.print(
          `Resolved ${pluralize(resolvedCount, "error")} in \`${fileGroup.displayFile}\`; ${pluralize(rerun.errors.length, "error")} remain.\n`,
        );
      }

      if (resolvedThisRound === 0) {
        ctx.print("No further progress this round; stopping.\n");
        linter = rerun;
        break;
      }

      if (resolvedThisRound > resolvedInTargetedFiles) {
        const spillover = resolvedThisRound - resolvedInTargetedFiles;
        ctx.print(`Resolved ${pluralize(spillover, "additional error")} outside the targeted files.\n`);
      }

      fixedErrors += resolvedThisRound;
      linter = rerun;
      ctx.print(
        `Round ${round + 1} resolved ${pluralize(resolvedThisRound, "error")}; ${pluralize(linter.errors.length, "error")} remain.\n`,
      );
      await ctx.callProcedure("commit", `linter round ${round + 1}`);
    }

    ctx.print(
      `Completed linter workflow: fixed ${pluralize(fixedErrors, "error")}; ${pluralize(linter.errors.length, "error")} remain.\n`,
    );

    return {
      data: buildSummaryData(linter, fixedErrors),
      display: `Done. Fixed ${fixedErrors} errors, ${linter.errors.length} remaining with \`${linter.command}\`.\n`,
      summary: `linter: fixed ${fixedErrors}, remaining ${linter.errors.length}`,
    };
  },
} satisfies Procedure;
