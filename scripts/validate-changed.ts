import {
  collectChangedPaths,
  formatValidationPlan,
  runValidationPlan,
  selectValidationPlan,
} from "./validate-changed-lib.ts";

const repoRoot = process.cwd();
const plan = selectValidationPlan(collectChangedPaths(repoRoot), repoRoot);

console.log(formatValidationPlan(plan));
const exitCode = await runValidationPlan(plan, repoRoot);
process.exit(exitCode);
