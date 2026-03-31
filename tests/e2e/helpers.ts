import { describe } from "bun:test";

export const runE2E =
  process.env.SKIP_E2E !== "1" && process.env.NANO_AGENTBOSS_RUN_E2E === "1";

export const describeE2E = runE2E ? describe : describe.skip;
