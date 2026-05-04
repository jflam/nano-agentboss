import { expect, test } from "bun:test";
import * as agentAcp from "@nanoboss/agent-acp";

test("public entrypoint exports a smoke symbol", () => {
  expect(agentAcp.getAgentCatalog).toBeDefined();
  expect("parseClaudeDebugMetrics" in agentAcp).toBe(false);
  expect("parseCopilotLogMetrics" in agentAcp).toBe(false);
  expect("parseCopilotSessionState" in agentAcp).toBe(false);
  expect("parseDescendantPidsFromPsOutput" in agentAcp).toBe(false);
  expect("findCopilotLogsForPids" in agentAcp).toBe(false);
});
