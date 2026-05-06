import { expect, test } from "bun:test";
import * as acp from "@agentclientprotocol/sdk";
import * as adaptersAcpServer from "@nanoboss/adapters-acp-server";
import { runAcpServerStdioAdapter } from "@nanoboss/adapters-acp-server/testing";

test("public entrypoint exports a smoke symbol", () => {
  expect(adaptersAcpServer.runAcpServerCommand).toBeDefined();
});

test("public entrypoint only exposes the command entrypoint", () => {
  expect(Object.keys(adaptersAcpServer).sort()).toEqual(["runAcpServerCommand"]);
});

test("ACP stdio adapter starts protocol wiring and hands sessions to NanobossService", async () => {
  const clientToServer = new TransformStream<Uint8Array>();
  const serverToClient = new TransformStream<Uint8Array>();
  const sessionUpdates: acp.SessionNotification[] = [];
  const createSessionReadyCalls: Array<{
    cwd: string;
    defaultAgentSelection?: { provider: string; model?: string };
    sessionId?: string;
  }> = [];
  const availableCommands: acp.AvailableCommand[] = [{
    name: "smoke",
    description: "Smoke command from NanobossService",
  }];

  const adapterClosed = runAcpServerStdioAdapter({
    input: clientToServer.readable,
    output: serverToClient.writable,
    configureRuntime: () => {},
    createService: async () => ({
      async createSessionReady(params) {
        createSessionReadyCalls.push(params);
        return { sessionId: "session-from-service" };
      },
      getAvailableCommands() {
        return availableCommands;
      },
      async promptSession() {},
      cancel() {},
    }),
    logReady: () => {},
  });

  const client = new acp.ClientSideConnection(
    () => ({
      async requestPermission() {
        return { outcome: { outcome: "cancelled" } };
      },
      async sessionUpdate(params) {
        sessionUpdates.push(params);
      },
    }),
    acp.ndJsonStream(clientToServer.writable, serverToClient.readable),
  );

  try {
    const initialized = await client.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    expect(initialized.agentInfo?.name).toBe("nanoboss");
    expect(initialized.agentCapabilities?.loadSession).toBe(false);

    const session = await client.newSession({
      cwd: process.cwd(),
      mcpServers: [],
      _meta: {
        nanobossSessionId: "session-requested-by-client",
        defaultAgentSelection: {
          provider: "copilot",
          model: "gpt-5.4",
        },
      },
    });

    expect(session.sessionId).toBe("session-from-service");
    expect(createSessionReadyCalls).toEqual([{
      cwd: process.cwd(),
      defaultAgentSelection: {
        provider: "copilot",
        model: "gpt-5.4",
      },
      sessionId: "session-requested-by-client",
    }]);

    await waitFor(() => sessionUpdates.length > 0);
    expect(sessionUpdates).toEqual([{
      sessionId: "session-from-service",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands,
      },
    }]);
  } finally {
    await clientToServer.writable.close();
    await adapterClosed;
  }
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error("Timed out waiting for ACP session update.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
