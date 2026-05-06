import * as acp from "@agentclientprotocol/sdk";
import { getBuildLabel } from "@nanoboss/app-support";
import {
  promptInputFromAcpBlocks,
  setAgentRuntimeSessionRuntimeFactory,
} from "@nanoboss/agent-acp";
import { buildGlobalMcpStdioServer } from "@nanoboss/adapters-mcp";
import { NanobossService } from "@nanoboss/app-runtime";
import {
  buildTopLevelSessionMeta,
  extractDefaultAgentSelection,
  extractNanobossSessionId,
} from "./session-metadata.ts";
import { QueuedSessionUpdateEmitter } from "./session-update-emitter.ts";
import { Readable, Writable } from "node:stream";

interface AcpServerNanobossService {
  createSessionReady(params: {
    cwd: string;
    defaultAgentSelection?: Parameters<NanobossService["createSessionReady"]>[0]["defaultAgentSelection"];
    sessionId?: string;
  }): Promise<{ sessionId: string }>;
  getAvailableCommands(): acp.AvailableCommand[];
  promptSession(
    sessionId: string,
    promptInput: Parameters<NanobossService["promptSession"]>[1],
    emitter: Parameters<NanobossService["promptSession"]>[2],
  ): Promise<unknown>;
  cancel(sessionId: string): void;
}

export interface AcpServerStdioAdapterDeps {
  input: ReadableStream<Uint8Array>;
  output: WritableStream<Uint8Array>;
  createService?: () => Promise<AcpServerNanobossService>;
  configureRuntime?: () => void;
  logReady?: (message: string) => void;
}

class Nanoboss implements acp.Agent {
  constructor(
    private readonly connection: acp.AgentSideConnection,
    private readonly service: AcpServerNanobossService,
  ) {}

  async initialize(_params: acp.InitializeRequest): Promise<acp.InitializeResponse> {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentInfo: {
        name: "nanoboss",
        version: "0.1.0",
      },
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: {
          image: true,
        },
      },
    };
  }

  async newSession(params: acp.NewSessionRequest): Promise<acp.NewSessionResponse> {
    const requestedSessionId = extractNanobossSessionId(params);
    const session = await this.service.createSessionReady({
      cwd: params.cwd,
      defaultAgentSelection: extractDefaultAgentSelection(params),
      sessionId: requestedSessionId,
    });

    await this.connection.sessionUpdate({
      sessionId: session.sessionId,
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: this.service.getAvailableCommands(),
      },
    });

    return {
      sessionId: session.sessionId,
      _meta: buildTopLevelSessionMeta(),
    };
  }

  async authenticate(_params: acp.AuthenticateRequest): Promise<acp.AuthenticateResponse> {
    return {};
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const emitter = new QueuedSessionUpdateEmitter(this.connection, params.sessionId);
    await this.service.promptSession(params.sessionId, promptInputFromAcpBlocks(params.prompt), emitter);
    return { stopReason: "end_turn" };
  }

  async cancel(params: acp.CancelNotification): Promise<void> {
    this.service.cancel(params.sessionId);
  }
}

export async function runAcpServerCommand(): Promise<void> {
  await runAcpServerStdioAdapter({
    input: Readable.toWeb(process.stdin),
    output: Writable.toWeb(process.stdout),
  });
}

export async function runAcpServerStdioAdapter(deps: AcpServerStdioAdapterDeps): Promise<void> {
  const logReady = deps.logReady ?? console.error;
  const configureRuntime = deps.configureRuntime ?? (() => {
    setAgentRuntimeSessionRuntimeFactory(() => ({
      mcpServers: [buildGlobalMcpStdioServer()],
    }));
  });
  const createService = deps.createService ?? NanobossService.create;

  logReady(`${getBuildLabel()} acp-server ready`);
  configureRuntime();
  const service = await createService();
  const stream = acp.ndJsonStream(
    deps.output,
    deps.input,
  );
  const connection = new acp.AgentSideConnection(
    (connection) => new Nanoboss(connection, service),
    stream,
  );
  await connection.closed;
}
