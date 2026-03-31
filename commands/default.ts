import type { Procedure } from "../src/types.ts";

export default {
  name: "default",
  description: "Pass prompt through to the downstream agent",
  async execute(prompt, ctx) {
    const result = await ctx.callAgent(prompt);
    return result.value;
  },
} satisfies Procedure;
