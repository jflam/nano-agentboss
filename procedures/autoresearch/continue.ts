import type { Procedure } from "@nanoboss/contracts";
import { executeAutoresearchContinueCommand } from "./runner.ts";

export default {
  name: "autoresearch/continue",
  description: "Continue the repo-local autoresearch session in the foreground",
  inputHint: "Optional continuation note",
  async execute(prompt, ctx) {
    return await executeAutoresearchContinueCommand(prompt, ctx);
  },
} satisfies Procedure;
