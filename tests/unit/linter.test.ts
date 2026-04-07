import { describe, expect, test } from "bun:test";

import {
  buildFixPrompt,
  groupErrorsByFile,
  parseEslintJsonOutput,
  selectFixWave,
} from "../../commands/linter.ts";

describe("/linter helpers", () => {
  test("groups relative and absolute paths by normalized file", () => {
    const cwd = "/repo";
    const errors = [
      {
        file: "src/app.ts",
        line: 1,
        column: 1,
        message: "first",
        rule: "rule-a",
      },
      {
        file: "/repo/src/app.ts",
        line: 2,
        column: 3,
        message: "second",
        rule: "rule-b",
      },
      {
        file: "src/other.ts",
        line: 4,
        column: 5,
        message: "third",
        rule: "rule-c",
      },
    ];

    const groups = groupErrorsByFile(cwd, errors);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.normalizedFile).toBe("/repo/src/app.ts");
    expect(groups[0]?.displayFile).toBe("src/app.ts");
    expect(groups[0]?.errors).toHaveLength(2);
    expect(groups[1]?.normalizedFile).toBe("/repo/src/other.ts");
  });

  test("builds a file-scoped prompt that forbids full lint", () => {
    const prompt = buildFixPrompt({
      normalizedFile: "/repo/src/app.ts",
      displayFile: "src/app.ts",
      errors: [
        {
          file: "src/app.ts",
          line: 10,
          column: 2,
          message: "problem",
          rule: "rule-a",
        },
      ],
    });

    expect(prompt).toContain("Fix only the following linter errors in /repo/src/app.ts:");
    expect(prompt).toContain("- src/app.ts:10:2 problem (rule: rule-a)");
    expect(prompt).toContain("Do not run the full repo linter");
    expect(prompt).toContain("Do not search for or fix unrelated lint errors in other files.");
    expect(prompt).toContain("The caller will rerun lint and manage commits after you return.");
  });

  test("parses eslint json output into normalized linter errors", () => {
    const errors = parseEslintJsonOutput(
      "/repo",
      JSON.stringify([
        {
          filePath: "src/app.ts",
          messages: [
            {
              line: 4,
              column: 2,
              message: "problem",
              ruleId: "@typescript-eslint/no-unused-vars",
              severity: 2,
            },
            {
              line: 5,
              column: 1,
              message: "warning",
              ruleId: "no-console",
              severity: 1,
            },
          ],
        },
        {
          filePath: "/repo/src/other.ts",
          messages: [
            {
              line: 1,
              column: 1,
              message: "parse error",
              ruleId: null,
              severity: 2,
            },
          ],
        },
      ]),
    );

    expect(errors).toEqual([
      {
        file: "/repo/src/app.ts",
        line: 4,
        column: 2,
        message: "problem",
        rule: "@typescript-eslint/no-unused-vars",
      },
      {
        file: "/repo/src/other.ts",
        line: 1,
        column: 1,
        message: "parse error",
        rule: "parsing",
      },
    ]);
  });

  test("selects a bounded fix wave", () => {
    const groups = groupErrorsByFile("/repo", [
      {
        file: "src/a.ts",
        line: 1,
        column: 1,
        message: "first",
        rule: "rule-a",
      },
      {
        file: "src/b.ts",
        line: 1,
        column: 1,
        message: "second",
        rule: "rule-b",
      },
      {
        file: "src/c.ts",
        line: 1,
        column: 1,
        message: "third",
        rule: "rule-c",
      },
    ]);

    const wave = selectFixWave(groups, 2);

    expect(wave.map((group) => group.displayFile)).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
