import { afterEach, describe, expect, test } from "bun:test";

import {
  buildAgentRuntimeSessionRuntime,
  setAgentRuntimeSessionRuntimeFactory,
} from "@nanoboss/agent-acp";

const originalSelfCommand = process.env.NANOBOSS_SELF_COMMAND;

afterEach(() => {
  setAgentRuntimeSessionRuntimeFactory(undefined);
  if (originalSelfCommand === undefined) {
    Reflect.deleteProperty(process.env, "NANOBOSS_SELF_COMMAND");
  } else {
    process.env.NANOBOSS_SELF_COMMAND = originalSelfCommand;
  }
});

describe("agent runtime capability", () => {
  test("mounts the MCP-backed runtime capability path through an injected factory", () => {
    setAgentRuntimeSessionRuntimeFactory(() => ({
      mcpServers: [
        {
          type: "stdio",
          name: "nanoboss",
          command: "nanoboss",
          args: ["mcp"],
          env: [],
        },
      ],
    }));

    const runtime = buildAgentRuntimeSessionRuntime();

    expect(runtime.mcpServers).toHaveLength(1);
    expect(runtime.mcpServers[0]).toMatchObject({
      type: "stdio",
      name: "nanoboss",
    });
  });

  test("uses the shared self-command resolver for the default MCP runtime", () => {
    process.env.NANOBOSS_SELF_COMMAND = "nanoboss-test";

    const runtime = buildAgentRuntimeSessionRuntime();

    expect(runtime.mcpServers[0]).toMatchObject({
      type: "stdio",
      name: "nanoboss",
      command: "nanoboss-test",
      args: ["mcp"],
      env: [],
    });
  });
});
