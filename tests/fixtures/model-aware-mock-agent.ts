import * as acp from "@agentclientprotocol/sdk";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Readable, Writable } from "node:stream";

interface StoredSession {
  sessionId: string;
  currentModel?: string;
}

const AGENT_ID = process.env.MODEL_AWARE_AGENT_ID?.trim() || "unknown";
const LOG_PATH = process.env.MODEL_AWARE_AGENT_LOG?.trim() || undefined;

class ModelAwareMockAgent implements acp.Agent {
  private readonly sessions = new Map<string, StoredSession>();

  constructor(private readonly connection: acp.AgentSideConnection) {}

  async initialize(_params: acp.InitializeRequest): Promise<acp.InitializeResponse> {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentInfo: {
        name: `model-aware-mock-agent-${AGENT_ID}`,
        version: "0.1.0",
      },
      agentCapabilities: {
        loadSession: false,
      },
    };
  }

  async newSession(_params: acp.NewSessionRequest): Promise<acp.NewSessionResponse> {
    const session: StoredSession = {
      sessionId: crypto.randomUUID(),
    };
    this.sessions.set(session.sessionId, session);
    writeLog({ kind: "new_session", agentId: AGENT_ID, sessionId: session.sessionId });
    return {
      sessionId: session.sessionId,
    };
  }

  async authenticate(_params: acp.AuthenticateRequest): Promise<acp.AuthenticateResponse> {
    return {};
  }

  async unstable_setSessionModel(params: acp.SetSessionModelRequest): Promise<void> {
    const session = this.getSession(params.sessionId);
    session.currentModel = params.modelId;
    writeLog({
      kind: "set_model",
      agentId: AGENT_ID,
      sessionId: session.sessionId,
      modelId: params.modelId,
    });
  }

  async setSessionConfigOption(_params: acp.SetSessionConfigOptionRequest): Promise<acp.SetSessionConfigOptionResponse> {
    return {
      configOptions: [],
    };
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const session = this.getSession(params.sessionId);
    const prompt = params.prompt
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    writeLog({
      kind: "prompt",
      agentId: AGENT_ID,
      sessionId: session.sessionId,
      modelId: session.currentModel,
      prompt,
    });

    const text = prompt.includes("Critique the referenced answer `answer` and return a critique object.")
      ? JSON.stringify({
          verdict: "mixed",
          summary: "critique summary",
          issues: ["issue one", "issue two"],
          mainIssue: "issue one",
          revisedAnswer: "revised answer",
        })
      : `first-pass:${session.currentModel ?? "default"}`;

    await this.connection.sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text,
        },
      },
    });

    return { stopReason: "end_turn" };
  }

  async cancel(_params: acp.CancelNotification): Promise<void> {
    // no-op
  }

  private getSession(sessionId: string): StoredSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return session;
  }
}

function writeLog(entry: Record<string, unknown>): void {
  if (!LOG_PATH) {
    return;
  }

  mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

const stream = acp.ndJsonStream(
  Writable.toWeb(process.stdout),
  Readable.toWeb(process.stdin),
);
const connection = new acp.AgentSideConnection(
  (connection) => new ModelAwareMockAgent(connection),
  stream,
);
await connection.closed;
