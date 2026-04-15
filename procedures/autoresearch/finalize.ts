import type { Procedure } from "@nanoboss/procedure-sdk";
import { executeAutoresearchFinalizeCommand } from "./runner.ts";

export default {
  name: "autoresearch/finalize",
  description: "Split kept autoresearch wins into review branches from the merge-base",
  async execute(prompt, ctx) {
    return await executeAutoresearchFinalizeCommand(prompt, ctx);
  },
} satisfies Procedure;
