import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";

import { PACKAGE_NAMES, type PackageName } from "../../scripts/package-graph.ts";
import { selectValidationPlan } from "../../scripts/validate-changed-lib.ts";

describe("validate:changed selector", () => {
  test("docs-only changes do not select code validation", () => {
    const plan = selectValidationPlan([
      "plans/2026-05-06-agent-test-infrastructure-and-policy-plan.md",
      "docs/architecture.md",
      "README.md",
    ], createFixtureRepo());

    expect(plan.kind).toBe("none");
    expect(plan.commands).toEqual([]);
    expect(plan.reasons.join("\n")).toContain("docs/plans-only");
  });

  test("single package test changes run only that package test file", () => {
    const plan = selectValidationPlan([
      "packages/store/tests/settings.test.ts",
    ], createFixtureRepo());

    expect(plan.kind).toBe("commands");
    expect(plan.commands).toEqual([{
      label: "store test tests/settings.test.ts",
      argv: ["bun", "test", "tests/settings.test.ts"],
      cwd: "packages/store",
      reasons: ["packages/store/tests/settings.test.ts: changed package test file"],
    }]);
  });

  test("public package API changes include reverse dependents", () => {
    const repoRoot = createFixtureRepo({
      store: ["procedure-sdk"],
      "tui-extension-sdk": ["procedure-sdk"],
      "adapters-tui": ["store", "tui-extension-sdk"],
    });
    const plan = selectValidationPlan([
      "packages/procedure-sdk/src/index.ts",
    ], repoRoot);

    const packageCommands = plan.commands
      .filter((command) => command.cwd?.startsWith("packages/"))
      .map((command) => `${command.cwd}:${command.argv.join(" ")}`);

    expect(packageCommands).toEqual([
      "packages/adapters-tui:bun run typecheck",
      "packages/procedure-sdk:bun run typecheck",
      "packages/store:bun run typecheck",
      "packages/tui-extension-sdk:bun run typecheck",
      "packages/adapters-tui:bun test",
      "packages/procedure-sdk:bun test",
      "packages/store:bun test",
      "packages/tui-extension-sdk:bun test",
    ]);
    expect(plan.commands.find((command) => command.label === "root unit tests")?.argv).toContain(
      "tests/unit/package-dependency-direction.test.ts",
    );
  });

  test("root package and config changes fall back to full pre-commit", () => {
    const plan = selectValidationPlan(["package.json"], createFixtureRepo());

    expect(plan.kind).toBe("full-precommit");
    expect(plan.commands).toEqual([{
      label: "full pre-commit",
      argv: ["bun", "run", "check:precommit"],
      reasons: ["package.json: root package/config/build-system change requires full pre-commit"],
    }]);
  });

  test("uncertain paths fall back to full pre-commit", () => {
    const plan = selectValidationPlan(["src/unmapped.ts"], createFixtureRepo());

    expect(plan.kind).toBe("full-precommit");
    expect(plan.commands[0]?.argv).toEqual(["bun", "run", "check:precommit"]);
    expect(plan.reasons[0]).toContain("not covered");
  });
});

function createFixtureRepo(dependencies: Partial<Record<PackageName, readonly PackageName[]>> = {}): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "nanoboss-validate-changed-"));
  for (const packageName of PACKAGE_NAMES) {
    const packageRoot = join(repoRoot, "packages", packageName);
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
      name: `@nanoboss/${packageName}`,
      dependencies: Object.fromEntries(
        (dependencies[packageName] ?? []).map((dependency) => [`@nanoboss/${dependency}`, "workspace:*"]),
      ),
    }, null, 2)}\n`, "utf8");
  }

  return repoRoot;
}
