import type { Procedure } from "../src/types.ts";

export default {
  name: "commit",
  description: "Git commit staged or recent changes with a descriptive message",
  async execute(prompt, ctx) {
    await ctx.callAgent(
      `Git commit the changes in ${ctx.cwd} with a descriptive message. Context: ${prompt}`,
    );
  },
} satisfies Procedure;
