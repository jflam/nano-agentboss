import type { KernelValue, Procedure, ProcedureResult } from "../../src/core/types.ts";
import { summarizeText } from "../../src/util/text.ts";

import {
  ensureTrailingNewline,
  type PreCommitChecksResult,
  resolvePreCommitChecks,
  type PreCommitChecksFreshRunReason,
  type ResolvedPreCommitChecksResult,
} from "./test-cache-lib.ts";

interface PreCommitChecksProcedureDeps {
  resolveChecks?: typeof resolvePreCommitChecks;
}

interface PreCommitChecksPauseState {
  version: 1;
  attemptCount: number;
  latestResult: ResolvedPreCommitChecksResult;
}

interface ChunkRenderState {
  currentPhase?: "lint" | "typecheck" | "test";
  pendingLine: string;
}

const FIX_SUGGESTED_REPLIES = [
  "yes, fix them",
  "no, leave them",
];

export function createPreCommitChecksProcedure(
  deps: PreCommitChecksProcedureDeps = {},
): Procedure {
  const resolveChecks = deps.resolveChecks ?? resolvePreCommitChecks;

  return {
    name: "nanoboss/pre-commit-checks",
    description: "Run or replay the repo pre-commit validation command",
    async execute(prompt, ctx) {
      const refresh = hasRefreshFlag(prompt);
      const verbose = hasVerboseFlag(prompt);
      const result = await runChecksAndPrintOutput(resolveChecks, ctx, refresh, verbose);
      return result.passed
        ? buildCompletedResult(result)
        : buildPausedFailureResult(result, 0);
    },
    async resume(prompt, stateValue, ctx) {
      const state = requirePauseState(stateValue);
      const decision = parseFixDecision(prompt);
      if (decision === "unclear") {
        return buildClarifyingPauseResult(state);
      }
      if (decision === "decline") {
        return buildDeclinedResult(state.latestResult);
      }

      ctx.print("Attempting one automated fix pass...\n");
      const fixResult = await ctx.callAgent(
        buildFixPrompt(ctx.cwd, state.latestResult, prompt),
        { stream: false },
      );
      if (typeof fixResult.data === "string" && fixResult.data.trim().length > 0) {
        ctx.print(ensureTrailingNewline(fixResult.data));
      }

      ctx.print("Re-running pre-commit checks...\n");
      const rerun = await runChecksAndPrintOutput(resolveChecks, ctx, true, false);
      return rerun.passed
        ? buildCompletedResult(rerun)
        : buildPausedFailureResult(rerun, state.attemptCount + 1);
    },
  };
}

function hasRefreshFlag(prompt: string): boolean {
  return prompt.trim().split(/\s+/).includes("--refresh");
}

function hasVerboseFlag(prompt: string): boolean {
  return prompt.trim().split(/\s+/).includes("--verbose");
}

function renderHeader(result: ResolvedPreCommitChecksResult, refresh: boolean): string {
  if (result.cacheHit) {
    return `Pre-commit checks cache hit for \`${result.command}\`.\n`;
  }

  if (refresh) {
    return `Refreshing pre-commit checks with \`${result.command}\`.\n`;
  }

  return `Running pre-commit checks with \`${result.command}\`.\n`;
}

function renderFreshRunHeader(reason: PreCommitChecksFreshRunReason, command: string): string {
  switch (reason) {
    case "refresh":
      return `Refresh requested; re-running pre-commit checks with \`${command}\`.\n`;
    case "cold_cache":
      return `No cached pre-commit result matched; running \`${command}\`.\n`;
    case "workspace_changed":
      return `Dirty repo detected; re-running checks for confidence with \`${command}\`.\n`;
    case "runtime_changed":
      return `Runtime changed since the last cached result; re-running \`${command}\`.\n`;
    case "command_changed":
      return `Pre-commit command changed; re-running \`${command}\`.\n`;
  }
}

function renderDisplay(result: ResolvedPreCommitChecksResult): string {
  const source = result.cacheHit ? "cached" : "fresh";
  const status = result.passed ? "passed" : `failed (exit ${result.exitCode})`;
  return `Pre-commit checks ${status} using ${source} result for \`${result.command}\`.\n`;
}

function renderSummary(result: ResolvedPreCommitChecksResult): string {
  const status = result.passed ? "pass" : `fail (${result.exitCode})`;
  return `nanoboss/pre-commit-checks: ${status}${result.cacheHit ? " cached" : ""}`;
}

function buildCompletedResult(result: ResolvedPreCommitChecksResult): ProcedureResult {
  return {
    data: serializeChecksResult(result),
    display: renderDisplay(result),
    summary: renderSummary(result),
  };
}

function buildPausedFailureResult(
  result: ResolvedPreCommitChecksResult,
  attemptCount: number,
): ProcedureResult {
  const attemptLine = attemptCount > 0
    ? `Automatic fix attempt ${attemptCount} did not clear all issues.`
    : undefined;
  const question = buildFixQuestion(result, attemptCount);
  return {
    data: serializeChecksResult(result),
    display: [
      renderDisplay(result).trimEnd(),
      renderFailureDigest(result),
      attemptLine,
      question,
    ].filter((value): value is string => Boolean(value)).join("\n") + "\n",
    summary: renderSummary(result),
    pause: {
      question,
      state: {
        version: 1,
        attemptCount,
        latestResult: result,
      },
      inputHint: "Reply yes to attempt an automated fix pass, or no to leave the failures as-is",
      suggestedReplies: FIX_SUGGESTED_REPLIES,
    },
  };
}

function buildClarifyingPauseResult(state: PreCommitChecksPauseState): ProcedureResult {
  const question = "Reply yes to attempt an automated fix pass, or no to leave the current failures as-is.";
  return {
    data: serializeChecksResult(state.latestResult),
    display: `${question}\n`,
    summary: renderSummary(state.latestResult),
    pause: {
      question,
      state,
      inputHint: "Reply yes or no",
      suggestedReplies: FIX_SUGGESTED_REPLIES,
    },
  };
}

function buildDeclinedResult(result: ResolvedPreCommitChecksResult): ProcedureResult {
  return {
    data: serializeChecksResult(result),
    display: "Pre-commit checks still fail. Automatic fix was skipped.\n",
    summary: renderSummary(result),
  };
}

function buildFixQuestion(result: ResolvedPreCommitChecksResult, attemptCount: number): string {
  return attemptCount > 0
    ? `Pre-commit checks still fail with exit ${result.exitCode}. Do you want me to try another automated fix pass?`
    : `Pre-commit checks failed with exit ${result.exitCode}. Do you want me to try fixing these automatically?`;
}

function serializeChecksResult(result: ResolvedPreCommitChecksResult): PreCommitChecksResult {
  return {
    command: result.command,
    cacheHit: result.cacheHit,
    exitCode: result.exitCode,
    passed: result.passed,
    workspaceStateFingerprint: result.workspaceStateFingerprint,
    runtimeFingerprint: result.runtimeFingerprint,
    createdAt: result.createdAt,
  };
}

async function runChecksAndPrintOutput(
  resolveChecks: typeof resolvePreCommitChecks,
  ctx: Parameters<Procedure["execute"]>[1],
  refresh: boolean,
  verbose: boolean,
): Promise<ResolvedPreCommitChecksResult> {
  const chunkRenderState: ChunkRenderState = {
    pendingLine: "",
  };
  const result = await resolveChecks({
    cwd: ctx.cwd,
    refresh,
    onFreshRun(event) {
      ctx.print(renderFreshRunHeader(event.reason, event.command));
    },
    onOutputChunk(chunk) {
      const printable = consumeRenderedChunks(chunkRenderState, chunk, verbose);
      if (printable.length > 0) {
        ctx.print(printable);
      }
    },
  });

  const trailingOutput = flushRenderedChunks(chunkRenderState, verbose);
  if (trailingOutput.length > 0) {
    ctx.print(trailingOutput);
  }

  if (verbose || result.passed) {
    if (result.cacheHit) {
      ctx.print(renderHeader(result, refresh));
      const cleanOutput = stripPreCommitMarkers(result.combinedOutput);
      if (cleanOutput.length > 0) {
        ctx.print(ensureTrailingNewline(cleanOutput));
      }
    }
  } else if (result.cacheHit) {
    ctx.print(renderHeader(result, refresh));
    ctx.print(`${renderFailureDigest(result)}\n`);
  } else {
    ctx.print(`${renderFailureDigest(result)}\n`);
  }

  return result;
}

function renderFailureDigest(result: ResolvedPreCommitChecksResult): string {
  const phaseResults = extractPreCommitPhaseResults(result.combinedOutput);
  if (phaseResults.length > 0) {
    const lines = phaseResults.map((phaseResult) =>
      `- ${phaseResult.phase}: ${renderPhaseStatus(phaseResult.status, phaseResult.exitCode)}`);
    const failedPhase = phaseResults.find((phaseResult) => phaseResult.status === "failed");
    const details = failedPhase?.phase === "typecheck"
      ? renderTypeScriptFailureDetails(result.combinedOutput)
      : compactFailureExcerpt(stripPreCommitMarkers(result.combinedOutput));
    return [
      "Validation summary:",
      ...lines,
      ...(details.length > 0 ? [details] : []),
      "Run `/nanoboss/pre-commit-checks --refresh --verbose` to inspect the full raw output.",
    ].join("\n");
  }

  return renderLegacyFailureDigest(result);
}

function renderLegacyFailureDigest(result: ResolvedPreCommitChecksResult): string {
  const diagnostics = extractTypeScriptDiagnostics(result.combinedOutput);
  if (diagnostics.length > 0) {
    const uniqueFiles = new Set(diagnostics.map((diagnostic) => diagnostic.file)).size;
    const preview = diagnostics
      .slice(0, 5)
      .map((diagnostic) =>
        `- ${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.code} ${summarizeText(diagnostic.message, 120)}`);
    if (diagnostics.length > preview.length) {
      preview.push(`- ... and ${diagnostics.length - preview.length} more TypeScript errors.`);
    }
    return [
      `Typecheck reported ${diagnostics.length} error${diagnostics.length === 1 ? "" : "s"} across ${uniqueFiles} file${uniqueFiles === 1 ? "" : "s"}.`,
      ...preview,
      "Run `/nanoboss/pre-commit-checks --refresh --verbose` to inspect the full raw output.",
    ].join("\n");
  }

  const excerpt = compactFailureExcerpt(result.combinedOutput);
  return [
    `Validation failed with exit ${result.exitCode}.`,
    excerpt.length > 0 ? excerpt : "No concise failure excerpt was available.",
    "Run `/nanoboss/pre-commit-checks --refresh --verbose` to inspect the full raw output.",
  ].join("\n");
}

function renderTypeScriptFailureDetails(output: string): string {
  const diagnostics = extractTypeScriptDiagnostics(output);
  if (diagnostics.length === 0) {
    return compactFailureExcerpt(stripPreCommitMarkers(output));
  }

  const uniqueFiles = new Set(diagnostics.map((diagnostic) => diagnostic.file)).size;
  const grouped = new Map<string, typeof diagnostics>();
  for (const diagnostic of diagnostics) {
    const entries = grouped.get(diagnostic.file);
    if (entries) {
      entries.push(diagnostic);
    } else {
      grouped.set(diagnostic.file, [diagnostic]);
    }
  }
  const preview = [...grouped.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([file, fileDiagnostics]) => {
      const first = fileDiagnostics[0];
      if (!first) {
        return `- ${file}`;
      }
      const suffix = fileDiagnostics.length > 1 ? ` (${fileDiagnostics.length} errors)` : "";
      return `- ${file}${suffix}: ${first.line}:${first.column} ${first.code} ${summarizeText(first.message, 110)}`;
    });
  if (grouped.size > preview.length) {
    preview.push(`- ... and ${grouped.size - preview.length} more files with TypeScript errors.`);
  }

  return [
    `Typecheck reported ${diagnostics.length} error${diagnostics.length === 1 ? "" : "s"} across ${uniqueFiles} file${uniqueFiles === 1 ? "" : "s"}.`,
    ...preview,
  ].join("\n");
}

function compactFailureExcerpt(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("$ "))
    .slice(0, 6)
    .map((line) => `- ${summarizeText(line, 140)}`);
  return lines.join("\n");
}

function stripPreCommitMarkers(output: string): string {
  return output
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("[[nanoboss-precommit]] "))
    .join("\n");
}

function extractPreCommitPhaseResults(output: string): Array<{
  phase: "lint" | "typecheck" | "test";
  status: "passed" | "failed" | "not_run";
  exitCode?: number;
}> {
  for (const line of output.split(/\r?\n/).reverse()) {
    if (!line.startsWith("[[nanoboss-precommit]] ")) {
      continue;
    }

    const payload = line.slice("[[nanoboss-precommit]] ".length);
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      const candidate = parsed as {
        type?: unknown;
        phases?: Array<{
          phase?: unknown;
          status?: unknown;
          exitCode?: unknown;
        }>;
      };
      if (candidate.type !== "run_result" || !Array.isArray(candidate.phases)) {
        continue;
      }
      return candidate.phases.flatMap((phase) => {
        if (
          (phase.phase === "lint" || phase.phase === "typecheck" || phase.phase === "test")
          && (phase.status === "passed" || phase.status === "failed" || phase.status === "not_run")
        ) {
          return [{
            phase: phase.phase,
            status: phase.status,
            ...(typeof phase.exitCode === "number" ? { exitCode: phase.exitCode } : {}),
          }];
        }
        return [];
      });
    } catch {
      continue;
    }
  }

  return [];
}

function renderPhaseStatus(status: "passed" | "failed" | "not_run", exitCode?: number): string {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return typeof exitCode === "number" ? `failed (exit ${exitCode})` : "failed";
    case "not_run":
      return "not run";
  }
}

function consumeRenderedChunks(state: ChunkRenderState, chunk: string, verbose: boolean): string {
  state.pendingLine += chunk;
  const completeLines = state.pendingLine.split("\n");
  state.pendingLine = completeLines.pop() ?? "";

  let printable = "";
  for (const line of completeLines) {
    const renderedLine = `${line}\n`;
    if (line.startsWith("[[nanoboss-precommit]] ")) {
      updateChunkRenderState(state, line);
      continue;
    }
    if (verbose || state.currentPhase === "test") {
      printable += renderedLine;
    }
  }

  return printable;
}

function flushRenderedChunks(state: ChunkRenderState, verbose: boolean): string {
  if (state.pendingLine.length === 0) {
    return "";
  }
  const line = state.pendingLine;
  state.pendingLine = "";
  if (line.startsWith("[[nanoboss-precommit]] ")) {
    updateChunkRenderState(state, line);
    return "";
  }
  return verbose || state.currentPhase === "test" ? line : "";
}

function updateChunkRenderState(state: ChunkRenderState, markerLine: string): void {
  const payload = markerLine.slice("[[nanoboss-precommit]] ".length);
  try {
    const parsed = JSON.parse(payload) as {
      type?: unknown;
      phase?: unknown;
    };
    if (parsed.type === "phase_start" && (parsed.phase === "lint" || parsed.phase === "typecheck" || parsed.phase === "test")) {
      state.currentPhase = parsed.phase;
    }
  } catch {
    return;
  }
}

function extractTypeScriptDiagnostics(output: string): Array<{
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}> {
  const diagnostics: Array<{
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
  }> = [];

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(.*)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
    if (!match) {
      continue;
    }

    const file = match[1];
    const lineNumber = match[2];
    const columnNumber = match[3];
    const code = match[4];
    const message = match[5];
    if (!file || !lineNumber || !columnNumber || !code || !message) {
      continue;
    }
    diagnostics.push({
      file,
      line: Number.parseInt(lineNumber, 10),
      column: Number.parseInt(columnNumber, 10),
      code,
      message,
    });
  }

  return diagnostics;
}

function parseFixDecision(prompt: string): "accept" | "decline" | "unclear" {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return "unclear";
  }

  if (
    normalized.includes("yes")
    || normalized.includes("fix")
    || normalized.includes("try")
    || normalized.includes("go ahead")
    || normalized.includes("do it")
  ) {
    return "accept";
  }

  if (
    normalized.includes("no")
    || normalized.includes("skip")
    || normalized.includes("leave")
    || normalized.includes("stop")
    || normalized.includes("don't")
    || normalized.includes("do not")
  ) {
    return "decline";
  }

  return "unclear";
}

function buildFixPrompt(cwd: string, result: ResolvedPreCommitChecksResult, userReply: string): string {
  return [
    `Inspect the repository at ${cwd} and fix the current pre-commit check failures.`,
    "You are handling one bounded automatic fix pass for the caller.",
    `The failing validation command is: ${result.command}`,
    `The most recent exit code was: ${result.exitCode}`,
    `The user reply was: ${userReply.trim() || "(empty reply)"}`,
    "Fix the underlying issues directly in the repository.",
    "Do not create commits.",
    "Do not run the full validation command again after your edits; the caller will rerun it.",
    "Keep the changes narrowly focused on the reported failures.",
    "",
    "Validation output:",
    result.combinedOutput,
  ].join("\n");
}

function requirePauseState(stateValue: KernelValue): PreCommitChecksPauseState {
  if (!isPreCommitChecksPauseState(stateValue)) {
    throw new Error("Invalid pre-commit checks continuation state");
  }
  return stateValue;
}

function isPreCommitChecksPauseState(value: KernelValue): value is PreCommitChecksPauseState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.version === 1
    && typeof candidate.attemptCount === "number"
    && isResolvedPreCommitChecksResult(candidate.latestResult);
}

function isResolvedPreCommitChecksResult(value: unknown): value is ResolvedPreCommitChecksResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.command === "string"
    && typeof candidate.cacheHit === "boolean"
    && typeof candidate.runReason === "string"
    && typeof candidate.exitCode === "number"
    && typeof candidate.passed === "boolean"
    && typeof candidate.workspaceStateFingerprint === "string"
    && typeof candidate.runtimeFingerprint === "string"
    && typeof candidate.createdAt === "string"
    && typeof candidate.stdout === "string"
    && typeof candidate.stderr === "string"
    && typeof candidate.combinedOutput === "string"
    && typeof candidate.summary === "string"
    && typeof candidate.durationMs === "number";
}

export default createPreCommitChecksProcedure();
