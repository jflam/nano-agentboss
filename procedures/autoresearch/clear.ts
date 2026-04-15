import type { Procedure } from "@nanoboss/procedure-sdk";
import { executeAutoresearchClearCommand } from "./runner.ts";

export default {
  name: "autoresearch/clear",
  description: "Delete repo-local autoresearch state after the loop is stopped",
  async execute(prompt, ctx) {
    return await executeAutoresearchClearCommand(prompt, ctx);
  },
} satisfies Procedure;
