import type { Procedure } from "@nanoboss/procedure-sdk";
import { executeAutoresearchStatusCommand } from "./runner.ts";

export default {
  name: "autoresearch/status",
  description: "Inspect the current repo-local autoresearch session",
  async execute(prompt, ctx) {
    return await executeAutoresearchStatusCommand(prompt, ctx);
  },
} satisfies Procedure;
