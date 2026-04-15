import type { Procedure } from "@nanoboss/contracts";
import { executeAutoresearchCommand } from "./runner.ts";

export default {
  name: "autoresearch",
  description: "Show the explicit autoresearch v1 command surface",
  async execute(prompt, ctx) {
    return await executeAutoresearchCommand(prompt, ctx);
  },
} satisfies Procedure;
