import type { Procedure } from "../src/types.ts";

interface LinterError {
  file: string;
  line: number;
  column: number;
  message: string;
  rule: string;
}

interface FixResult {
  fixed: boolean;
  description: string;
}

const LinterErrors = {
  schema: {
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
  validate(input: unknown): input is LinterError[] {
    return (
      Array.isArray(input) &&
      input.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.file === "string" &&
          typeof item.line === "number" &&
          typeof item.column === "number" &&
          typeof item.message === "string" &&
          typeof item.rule === "string",
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

export default {
  name: "linter",
  description: "Fix all linter errors in the project",
  inputHint: "Optional focus area or instructions",
  async execute(prompt, ctx) {
    let retries = 0;
    let totalFixed = 0;
    let totalFailed = 0;

    let errors = (
      await ctx.callAgent<LinterError[]>(
        `Run the linter in ${ctx.cwd} and return all errors as a list. ${prompt}`,
        LinterErrors,
      )
    ).value;

    while (errors.length > 0 && retries < MAX_RETRIES) {
      ctx.print(`Round ${retries + 1}: ${errors.length} errors to fix\n`);

      for (const error of errors) {
        let fixRetries = 0;
        let fixed = false;

        do {
          const result = await ctx.callAgent<FixResult>(
            [
              `Fix this linter error in ${ctx.cwd}:`,
              `${error.file}:${error.line}:${error.column} ${error.message} (rule: ${error.rule})`,
              "After fixing it, run the build and tests if available.",
              "Return whether the fix was successful.",
            ].join("\n"),
            FixResultType,
          );
          fixed = result.value.fixed;
          fixRetries += 1;
        } while (!fixed && fixRetries < MAX_FIX_RETRIES);

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

      errors = (
        await ctx.callAgent<LinterError[]>(
          `Run the linter again in ${ctx.cwd} and return all remaining errors. ${prompt}`,
          LinterErrors,
        )
      ).value;

      retries += 1;
    }

    ctx.print(
      `Done. Fixed ${totalFixed} errors, ${totalFailed} failed, ${errors.length} remaining.\n`,
    );
  },
} satisfies Procedure;
