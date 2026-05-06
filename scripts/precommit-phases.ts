import type { PreCommitPhaseName as PhaseName } from "../procedures/nanoboss/pre-commit-checks-protocol.ts";

export interface PreCommitPhase {
  phase: PhaseName;
  argv: string[];
  cwd?: string;
}

export const PRE_COMMIT_PHASES: readonly PreCommitPhase[] = [
  {
    phase: "lint",
    argv: ["bun", "run", "--silent", "lint"],
  },
  {
    phase: "typecheck",
    argv: ["bun", "run", "--silent", "typecheck"],
  },
  {
    phase: "typecheck:packages",
    argv: ["bun", "run", "--silent", "typecheck:packages"],
  },
  {
    phase: "knip",
    argv: ["bun", "run", "--silent", "knip"],
  },
  {
    phase: "procedure-sdk:build",
    argv: ["bun", "run", "--silent", "build"],
    cwd: "packages/procedure-sdk",
  },
  {
    phase: "procedure-sdk:verify:consumer",
    argv: ["bun", "run", "--silent", "verify:consumer"],
    cwd: "packages/procedure-sdk",
  },
  {
    phase: "test:packages",
    argv: ["bun", "run", "--silent", "test:packages"],
  },
  {
    phase: "test",
    argv: ["bun", "run", "--silent", "test"],
  },
];
