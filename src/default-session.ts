import * as acp from "@agentclientprotocol/sdk";
import { appendFileSync, mkdirSync } from "node:fs";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

import { getAgentTranscriptDir } from "./config.ts";
import type { CallAgentOptions, DownstreamAgentConfig } from "./types.ts";

interface DefaultSessionPromptOptions {
  onUpdate?: CallAgentOptions["onUpdate"];
  signal?: AbortSignal;
}

interface DefaultSessionPromptResult {
  raw: string;
  logFile?: string;
  updates: acp.SessionUpdate[];
  durationMs: number;
}

interface OpenConnectionState {
  child: ChildProcessByStdio<Writable, Readable, Readable>;
  connection: acp.ClientSideConnection;
  capabilities?: acp.AgentCapabilities;
  cwd: string;
  transcriptPath: string;
  setSessionUpdateHandler(handler: SessionUpdateHandler | undefined): void;
}

type SessionUpdateHandler = (params: acp.SessionNotification) => Promise<void> | void;

interface PromptCollector {
  raw: string;
  updates: acp.SessionUpdate[];
  onUpdate?: CallAgentOptions["onUpdate"];
}

export class DefaultConversationSession {
  private persistedSessionId?: acp.SessionId;
  private liveSession?: PersistentAcpSession;

  constructor(private config: DownstreamAgentConfig) {}

  get currentSessionId(): string | undefined {
    return this.persistedSessionId;
  }

  async prompt(
    prompt: string,
    options: DefaultSessionPromptOptions = {},
  ): Promise<DefaultSessionPromptResult> {
    const startedAt = Date.now();
    let session = this.liveSession;

    if (!session?.isAlive()) {
      session?.close();
      this.liveSession = undefined;
      session = undefined;
    }

    if (!session && this.persistedSessionId) {
      session = await PersistentAcpSession.load(this.config, this.persistedSessionId);
      if (session) {
        this.liveSession = session;
      }
    }

    if (!session) {
      session = await PersistentAcpSession.createFresh(this.config);
      this.liveSession = session;
    }

    this.persistedSessionId = session.sessionId;

    try {
      const result = await session.prompt(prompt, options);
      this.persistedSessionId = session.sessionId;
      return {
        ...result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (!session.isAlive()) {
        session.close();
        if (this.liveSession === session) {
          this.liveSession = undefined;
        }
      }
      throw error;
    }
  }

  updateConfig(config: DownstreamAgentConfig): void {
    if (sameAgentConfig(this.config, config)) {
      this.config = config;
      return;
    }

    this.closeLiveSession();
    this.persistedSessionId = undefined;
    this.config = config;
  }

  closeLiveSession(): void {
    this.liveSession?.close();
    this.liveSession = undefined;
  }
}

class PersistentAcpSession {
  private activeCollector?: PromptCollector;
  private closed = false;

  private constructor(
    private readonly state: OpenConnectionState,
    readonly sessionId: acp.SessionId,
    private readonly config: DownstreamAgentConfig,
  ) {
    this.state.setSessionUpdateHandler((params) => this.handleSessionUpdate(params));
  }

  static async createFresh(config: DownstreamAgentConfig): Promise<PersistentAcpSession> {
    const state = await openConnection(config);

    try {
      const session = await state.connection.newSession({
        cwd: state.cwd,
        mcpServers: [],
      });
      const runtime = new PersistentAcpSession(state, session.sessionId, config);
      await runtime.applySessionConfig();
      return runtime;
    } catch (error) {
      closeOpenConnection(state);
      throw error;
    }
  }

  static async load(
    config: DownstreamAgentConfig,
    sessionId: acp.SessionId,
  ): Promise<PersistentAcpSession | undefined> {
    const state = await openConnection(config);

    try {
      if (!state.capabilities?.loadSession) {
        closeOpenConnection(state);
        return undefined;
      }

      await state.connection.loadSession({
        cwd: state.cwd,
        mcpServers: [],
        sessionId,
      });

      const runtime = new PersistentAcpSession(state, sessionId, config);
      await runtime.applySessionConfig();
      return runtime;
    } catch {
      closeOpenConnection(state);
      return undefined;
    }
  }

  isAlive(): boolean {
    return !this.closed && this.state.child.exitCode === null && !this.state.connection.signal.aborted;
  }

  async prompt(
    prompt: string,
    options: DefaultSessionPromptOptions = {},
  ): Promise<{ raw: string; logFile?: string; updates: acp.SessionUpdate[] }> {
    if (!this.isAlive()) {
      throw new Error("Default ACP session is not available");
    }

    const collector: PromptCollector = {
      raw: "",
      updates: [],
      onUpdate: options.onUpdate,
    };
    this.activeCollector = collector;

    const abortListener = () => {
      void this.state.connection.cancel({ sessionId: this.sessionId }).catch(() => {});
      this.close();
    };

    if (options.signal?.aborted) {
      abortListener();
    }

    options.signal?.addEventListener("abort", abortListener);

    try {
      await this.state.connection.prompt({
        sessionId: this.sessionId,
        prompt: [
          {
            type: "text",
            text: prompt,
          },
        ],
      });

      return {
        raw: collector.raw,
        logFile: this.state.transcriptPath,
        updates: collector.updates,
      };
    } finally {
      options.signal?.removeEventListener("abort", abortListener);
      this.activeCollector = undefined;
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.state.setSessionUpdateHandler(undefined);
    this.state.child.kill();
  }

  private async applySessionConfig(): Promise<void> {
    if (this.config.model) {
      await this.state.connection.unstable_setSessionModel({
        sessionId: this.sessionId,
        modelId: this.config.model,
      });
    }

    if (this.config.reasoningEffort) {
      await this.state.connection.setSessionConfigOption({
        sessionId: this.sessionId,
        configId: "reasoning_effort",
        value: this.config.reasoningEffort,
      });
    }
  }

  private async handleSessionUpdate(params: acp.SessionNotification): Promise<void> {
    appendAgentTranscript(
      this.state.transcriptPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "session_update",
        update: params.update,
      }),
    );

    if (params.sessionId !== this.sessionId || !this.activeCollector) {
      return;
    }

    this.activeCollector.updates.push(params.update);

    if (
      params.update.sessionUpdate === "agent_message_chunk" &&
      params.update.content.type === "text"
    ) {
      this.activeCollector.raw += params.update.content.text;
    }

    await this.activeCollector.onUpdate?.(params.update);
  }
}

async function openConnection(config: DownstreamAgentConfig): Promise<OpenConnectionState> {
  const cwd = config.cwd ?? process.cwd();
  const transcriptPath = createTranscriptPath();
  let sessionUpdateHandler: SessionUpdateHandler | undefined;

  mkdirSync(getAgentTranscriptDir(), { recursive: true });
  appendAgentTranscript(
    transcriptPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "spawn",
      provider: config.provider,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      command: config.command,
      args: config.args,
      cwd,
    }),
  );

  const child: ChildProcessByStdio<Writable, Readable, Readable> = spawn(
    config.command,
    config.args,
    {
      cwd,
      env: {
        ...process.env,
        ...config.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  child.stderr.on("data", (chunk: Buffer | string) => {
    appendAgentTranscript(
      transcriptPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        stream: "stderr",
        text: chunk.toString(),
      }),
    );
  });

  const stream = acp.ndJsonStream(
    Writable.toWeb(child.stdin),
    Readable.toWeb(child.stdout),
  );

  const client: acp.Client = {
    async requestPermission(params) {
      const selected =
        params.options.find((option) => option.kind.startsWith("allow")) ??
        params.options[0];

      if (!selected) {
        return { outcome: { outcome: "cancelled" } };
      }

      appendAgentTranscript(
        transcriptPath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "permission",
          toolCall: params.toolCall,
          selected: selected.optionId,
        }),
      );

      return {
        outcome: {
          outcome: "selected",
          optionId: selected.optionId,
        },
      };
    },
    async sessionUpdate(params) {
      await sessionUpdateHandler?.(params);
    },
  };

  const connection = new acp.ClientSideConnection(() => client, stream);

  try {
    const initialized = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    return {
      child,
      connection,
      capabilities: initialized.agentCapabilities,
      cwd,
      transcriptPath,
      setSessionUpdateHandler(handler) {
        sessionUpdateHandler = handler;
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

function closeOpenConnection(state: OpenConnectionState): void {
  state.setSessionUpdateHandler(undefined);
  state.child.kill();
}

function sameAgentConfig(left: DownstreamAgentConfig, right: DownstreamAgentConfig): boolean {
  return (
    left.provider === right.provider &&
    left.command === right.command &&
    left.cwd === right.cwd &&
    left.model === right.model &&
    left.reasoningEffort === right.reasoningEffort &&
    sameStringArray(left.args, right.args) &&
    sameStringRecord(left.env, right.env)
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringRecord(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
): boolean {
  const leftEntries = Object.entries(left ?? {}).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const rightEntries = Object.entries(right ?? {}).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value], index) => {
      const rightEntry = rightEntries[index];
      return key === rightEntry[0] && value === rightEntry[1];
    })
  );
}

function createTranscriptPath(): string {
  return join(getAgentTranscriptDir(), `${crypto.randomUUID()}.jsonl`);
}

function appendAgentTranscript(path: string, line: string): void {
  appendFileSync(path, `${line}\n`, "utf8");
}
