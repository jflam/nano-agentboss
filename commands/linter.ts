import type { CommandContext, Procedure } from "../src/types.ts";

interface LinterError {
  file: string;
  line: number;
  column: number;
  message: string;
  rule: string;
}

interface LinterRunResult {
  status: "configured" | "missing_linter";
  command: string | null;
  summary: string;
  errors: LinterError[];
  recommendations: string[];
}

interface FixResult {
  fixed: boolean;
  description: string;
}

const LinterRunResultType = {
  schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["configured", "missing_linter"],
      },
      command: {
        type: ["string", "null"],
      },
      summary: {
        type: "string",
      },
      errors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            line: { type: "number" },
            column: { type: "number" },
            message: { type: "string" },
            rule: { type: "string" },
          },
          required: ["file", "line", "column", "message", "rule"],
          additionalProperties: false,
        },
      },
      recommendations: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["status", "command", "summary", "errors", "recommendations"],
    additionalProperties: false,
  },
  validate(input: unknown): input is LinterRunResult {
    return (
      typeof input === "object" &&
      input !== null &&
      "status" in input &&
      ((input as { status: unknown }).status === "configured" ||
        (input as { status: unknown }).status === "missing_linter") &&
      "command" in input &&
      ((input as { command: unknown }).command === null ||
        typeof (input as { command: unknown }).command === "string") &&
      "summary" in input &&
      typeof (input as { summary: unknown }).summary === "string" &&
      "errors" in input &&
      Array.isArray((input as { errors: unknown }).errors) &&
      (input as { errors: unknown[] }).errors.every(
        (item) => isLinterError(item),
      ) &&
      "recommendations" in input &&
      Array.isArray((input as { recommendations: unknown }).recommendations) &&
      (input as { recommendations: unknown[] }).recommendations.every(
        (item) => typeof item === "string",
      )
    );
  },
};

const FixResultType = {
  schema: {
    type: "object",
    properties: {
      fixed: { type: "boolean" },
      description: { type: "string" },
    },
    required: ["fixed", "description"],
    additionalProperties: false,
  },
  validate(input: unknown): input is FixResult {
    return (
      typeof input === "object" &&
      input !== null &&
      "fixed" in input &&
      typeof (input as { fixed: unknown }).fixed === "boolean" &&
      "description" in input &&
      typeof (input as { description: unknown }).description === "string"
    );
  },
};

const MAX_RETRIES = 3;
const MAX_FIX_RETRIES = 2;

function isLinterError(item: unknown): item is LinterError {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  const candidate = item as Partial<LinterError>;
  return (
    typeof candidate.file === "string" &&
    typeof candidate.line === "number" &&
    typeof candidate.column === "number" &&
    typeof candidate.message === "string" &&
    typeof candidate.rule === "string"
  );
}

function renderRecommendations(recommendations: string[]): string {
  if (recommendations.length === 0) {
    return "";
  }

  return recommendations.map((item) => `- ${item}`).join("\n");
}

function buildDiscoveryPrompt(cwd: string, prompt: string, command?: string): string {
  const commandInstruction = command
    ? [
        `Use this exact linter command and run it from ${cwd}: ${command}`,
        "Do not invent a different command unless this one clearly no longer works.",
      ].join("\n")
    : [
        `Inspect the repo at ${cwd} and figure out whether an existing linter is configured.`,
        "Check package.json scripts and common config files if needed.",
        "If a linter appears to be configured, try to actually run it.",
      ].join("\n");

  return [
    commandInstruction,
    "Do not install or configure anything.",
    "If no linter is configured or runnable, return status `missing_linter` with a short complaint and 1-3 concrete recommendations.",
    "If a linter exists, return status `configured`, the exact command you used, a short summary, and all current lint errors.",
    "If the linter runs successfully with zero errors, return status `configured` and an empty errors array.",
    `Additional user instructions: ${prompt || "none"}`,
  ].join("\n\n");
}

async function runLinter(
  ctx: CommandContext,
  prompt: string,
  command?: string,
): Promise<LinterRunResult> {
  return (
    await ctx.callAgent<LinterRunResult>(
      buildDiscoveryPrompt(ctx.cwd, prompt, command),
      LinterRunResultType,
    )
  ).value;
}

export default {
  name: "linter",
  description: "Fix all linter errors in the project",
  inputHint: "Optional focus area or instructions",
  async execute(prompt, ctx) {
    let retries = 0;
    let totalFixed = 0;
    let totalFailed = 0;

    let linter = await runLinter(ctx, prompt);
    if (linter.status === "missing_linter" || !linter.command) {
      const recommendations = renderRecommendations(linter.recommendations);
      ctx.print(
        `${linter.summary}\n${recommendations ? `${recommendations}\n` : ""}`,
      );
      return;
    }

    let linterCommand = linter.command;
    let errors = linter.errors;

    if (errors.length === 0) {
      ctx.print(`Linter command \`${linterCommand}\` ran cleanly. ${linter.summary}\n`);
      return;
    }

    while (errors.length > 0 && retries < MAX_RETRIES) {
      ctx.print(
        `Round ${retries + 1}: ${errors.length} errors to fix with \`${linterCommand}\`\n`,
      );

      for (const error of errors) {
        let fixRetries = 0;
        let fixed = false;

        while (fixRetries < MAX_FIX_RETRIES) {
          const result = await ctx.callAgent<FixResult>(
            [
              `Fix this linter error in ${ctx.cwd}:`,
              `${error.file}:${error.line}:${error.column} ${error.message} (rule: ${error.rule})`,
              `The linter command that must pass is: ${linterCommand}`,
              "After fixing it, run the build and tests if available.",
              "Return whether the fix was successful.",
            ].join("\n"),
            FixResultType,
          );
          fixRetries += 1;
          if (result.value.fixed) {
            fixed = true;
            break;
          }
        }

        if (fixed) {
          totalFixed += 1;
          await ctx.callProcedure(
            "commit",
            `linter fix for ${error.file}:${error.line} - ${error.message}`,
          );
        } else {
          totalFailed += 1;
        }
      }

      linter = await runLinter(ctx, prompt, linterCommand);
      if (linter.status === "missing_linter" || !linter.command) {
        const recommendations = renderRecommendations(linter.recommendations);
        ctx.print(
          `${linter.summary}\n${recommendations ? `${recommendations}\n` : ""}`,
        );
        return;
      }

      linterCommand = linter.command;
      errors = linter.errors;

      retries += 1;
    }

    ctx.print(
      `Done. Fixed ${totalFixed} errors, ${totalFailed} failed, ${errors.length} remaining with \`${linterCommand}\`.\n`,
    );
  },
} satisfies Procedure;
