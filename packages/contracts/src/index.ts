export type KernelScalar = null | boolean | number | string;
export type JsonValue = KernelScalar | JsonValue[] | { [key: string]: JsonValue };

export interface RunRef {
  sessionId: string;
  runId: string;
}

export interface Ref {
  run: RunRef;
  path: string;
}

export interface SessionRef {
  sessionId: string;
}

export interface DownstreamAgentConfig {
  provider?: DownstreamAgentProvider;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  model?: string;
  reasoningEffort?: string;
}

export type DownstreamAgentProvider = "claude" | "gemini" | "codex" | "copilot";

export interface DownstreamAgentSelection {
  provider: DownstreamAgentProvider;
  model?: string;
}

export interface SessionDescriptor {
  session: SessionRef;
  cwd: string;
  defaultAgentSelection?: DownstreamAgentSelection;
}

export interface PromptImagePart {
  type: "image";
  token: string;
  mimeType: string;
  data: string;
  width?: number;
  height?: number;
  byteLength?: number;
}

export type PromptPart =
  | {
      type: "text";
      text: string;
    }
  | PromptImagePart;

export interface PromptInput {
  parts: PromptPart[];
}

export interface PromptImageSummary {
  token: string;
  mimeType: string;
  width?: number;
  height?: number;
  byteLength?: number;
  attachmentId?: string;
  attachmentPath?: string;
}

export interface ProcedurePromptInput {
  parts: PromptPart[];
  text: string;
  displayText: string;
  images: PromptImageSummary[];
}

export interface Simplify2CheckpointContinuationUiAction {
  id: "approve" | "stop" | "focus_tests" | "other";
  label: string;
  reply?: string;
  description?: string;
}

export interface Simplify2CheckpointContinuationUi {
  kind: "simplify2_checkpoint";
  title: string;
  actions: Simplify2CheckpointContinuationUiAction[];
}

export interface Simplify2FocusPickerContinuationUiEntry {
  id: string;
  title: string;
  subtitle?: string;
  status: "active" | "paused" | "finished" | "archived";
  updatedAt: string;
  lastSummary?: string;
}

export interface Simplify2FocusPickerContinuationUiAction {
  id: "continue" | "archive" | "new" | "cancel";
  label: string;
}

export interface Simplify2FocusPickerContinuationUi {
  kind: "simplify2_focus_picker";
  title: string;
  entries: Simplify2FocusPickerContinuationUiEntry[];
  actions: Simplify2FocusPickerContinuationUiAction[];
}

export type ContinuationUi =
  | Simplify2CheckpointContinuationUi
  | Simplify2FocusPickerContinuationUi;

export interface Continuation<TState extends KernelValue = KernelValue> {
  question: string;
  state: TState;
  inputHint?: string;
  suggestedReplies?: string[];
  ui?: ContinuationUi;
}

export interface PendingContinuation<TState extends KernelValue = KernelValue> extends Continuation<TState> {
  procedure: string;
  run: RunRef;
}

export interface SessionMetadata {
  session: SessionRef;
  cwd: string;
  rootDir: string;
  createdAt: string;
  updatedAt: string;
  initialPrompt?: string;
  lastPrompt?: string;
  defaultAgentSelection?: DownstreamAgentSelection;
  defaultAgentSessionId?: string;
  pendingContinuation?: PendingContinuation;
}

export function createRunRef(sessionId: string, runId: string): RunRef {
  return { sessionId, runId };
}

export function createRef(run: RunRef, path: string): Ref {
  return { run, path };
}

export function createSessionRef(sessionId: string): SessionRef {
  return { sessionId };
}

export type KernelValue =
  | KernelScalar
  | RunRef
  | Ref
  | KernelValue[]
  | object;

export type RunKind = "top_level" | "procedure" | "agent";

export interface RunRecord {
  run: RunRef;
  kind: RunKind;
  procedure: string;
  input: string;
  output: {
    data?: KernelValue;
    display?: string;
    stream?: string;
    summary?: string;
    memory?: string;
    pause?: Continuation;
    explicitDataSchema?: object;
    replayEvents?: unknown[];
  };
  meta: {
    createdAt: string;
    parentRunId?: string;
    dispatchCorrelationId?: string;
    defaultAgentSelection?: DownstreamAgentSelection;
    promptImages?: PromptImageSummary[];
  };
}

export interface RunSummary {
  run: RunRef;
  procedure: string;
  kind: RunKind;
  parentRunId?: string;
  summary?: string;
  memory?: string;
  dataRef?: Ref;
  displayRef?: Ref;
  streamRef?: Ref;
  dataShape?: JsonValue;
  explicitDataSchema?: object;
  createdAt: string;
}

export interface RefStat {
  run: RunRef;
  path: string;
  type: string;
  size: number;
  preview?: string;
}

export interface RunFilterOptions {
  kind?: RunKind;
  procedure?: string;
  limit?: number;
}

export interface RunAncestorsOptions {
  includeSelf?: boolean;
  limit?: number;
}

export interface RunDescendantsOptions extends RunFilterOptions {
  maxDepth?: number;
}

export interface RunListOptions {
  scope?: "recent" | "top_level";
  procedure?: string;
  limit?: number;
}

export interface RefsApi {
  read<T = KernelValue>(ref: Ref): Promise<T>;
  stat(ref: Ref): Promise<RefStat>;
  writeToFile(ref: Ref, path: string): Promise<void>;
}

export interface StateRunsApi {
  list(options?: RunListOptions): Promise<RunSummary[]>;
  get(run: RunRef): Promise<RunRecord>;
  getAncestors(run: RunRef, options?: RunAncestorsOptions): Promise<RunSummary[]>;
  getDescendants(run: RunRef, options?: RunDescendantsOptions): Promise<RunSummary[]>;
}

export interface AgentTokenSnapshot {
  provider?: DownstreamAgentProvider;
  model?: string;
  sessionId?: string;
  source: "acp_usage_update" | "acp_prompt_response" | "copilot_log" | "copilot_session_state" | "claude_debug";
  capturedAt?: string;
  contextWindowTokens?: number;
  usedContextTokens?: number;
  systemTokens?: number;
  conversationTokens?: number;
  toolDefinitionsTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
}

export interface AgentTokenUsage {
  provider?: DownstreamAgentProvider;
  model?: string;
  sessionId?: string;
  source: AgentTokenSnapshot["source"];
  capturedAt?: string;
  currentContextTokens?: number;
  maxContextTokens?: number;
  systemTokens?: number;
  conversationTokens?: number;
  toolDefinitionsTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTrackedTokens?: number;
}

export interface SessionApi {
  getDefaultAgentConfig(): DownstreamAgentConfig;
  setDefaultAgentSelection(selection: DownstreamAgentSelection): DownstreamAgentConfig;
  getDefaultAgentTokenSnapshot(): Promise<AgentTokenSnapshot | undefined>;
  getDefaultAgentTokenUsage(): Promise<AgentTokenUsage | undefined>;
}

export interface StateApi {
  readonly runs: StateRunsApi;
  readonly refs: RefsApi;
}

export interface TypeDescriptor<T> {
  schema: object;
  validate: (input: unknown) => input is T;
}

type ValidatorResult = boolean | { success: boolean };

export function jsonType<T extends KernelValue>(
  schema: object,
  validator: (input: unknown) => ValidatorResult,
): TypeDescriptor<T>;
export function jsonType<T extends KernelValue>(
  schema?: object,
  validator?: (input: unknown) => ValidatorResult,
): TypeDescriptor<T> {
  if (!schema || !validator) {
    throw new Error(
      "jsonType(...) requires concrete schema and validator arguments, for example jsonType(typia.json.schema<Foo>(), typia.createValidate<Foo>()).",
    );
  }

  return {
    schema,
    validate(input: unknown): input is T {
      const result = validator(input);
      return typeof result === "boolean" ? result : result.success;
    },
  };
}

export interface ProcedureResult<T extends KernelValue = KernelValue> {
  data?: T;
  display?: string;
  summary?: string;
  memory?: string;
  pause?: Continuation;
  explicitDataSchema?: object;
}

export interface RunResult<T extends KernelValue = KernelValue> {
  run: RunRef;
  data?: T;
  dataRef?: Ref;
  display?: string;
  displayRef?: Ref;
  streamRef?: Ref;
  memory?: string;
  pause?: Continuation;
  pauseRef?: Ref;
  summary?: string;
  dataShape?: unknown;
  explicitDataSchema?: object;
  tokenUsage?: AgentTokenUsage;
  defaultAgentSelection?: DownstreamAgentSelection;
  rawRef?: Ref;
}

export interface AgentRunResult<T extends KernelValue = KernelValue> extends RunResult<T> {
  durationMs: number;
  raw: string;
  logFile?: string;
  tokenSnapshot?: AgentTokenSnapshot;
}

export interface AgentSessionPromptOptions {
  signal?: AbortSignal;
  softStopSignal?: AbortSignal;
}

export interface AgentSessionPromptResult {
  raw: string;
  logFile?: string;
  durationMs: number;
  tokenSnapshot?: AgentTokenSnapshot;
}

export interface AgentSession {
  sessionId?: string;
  getCurrentTokenSnapshot(): Promise<AgentTokenSnapshot | undefined>;
  prompt(prompt: string | PromptInput, options?: AgentSessionPromptOptions): Promise<AgentSessionPromptResult>;
  warm?(): Promise<void>;
  updateConfig(config: DownstreamAgentConfig): void;
  close(): void;
}

export type ProcedureExecutionMode = "agentSession" | "harness";

export interface ProcedureMetadata {
  name: string;
  description: string;
  inputHint?: string;
  executionMode?: ProcedureExecutionMode;
}

export interface Procedure extends ProcedureMetadata {
  execute(prompt: string, ctx: ProcedureApi): Promise<ProcedureResult | string | void>;
  resume?(prompt: string, state: KernelValue, ctx: ProcedureApi): Promise<ProcedureResult | string | void>;
}

export interface ProcedureRegistryLike {
  get(name: string): Procedure | undefined;
  register(procedure: Procedure): void;
  loadProcedureFromPath(path: string): Promise<Procedure>;
  persist(procedureName: string, source: string, cwd: string): Promise<string>;
  listMetadata(): ProcedureMetadata[];
}

export type AgentSessionMode = "fresh" | "default";
export type ProcedureSessionMode = AgentSessionMode | "inherit";

export interface CommandCallAgentOptions {
  session?: AgentSessionMode;
  persistedSessionId?: string;
  agent?: DownstreamAgentSelection;
  stream?: boolean;
  refs?: Record<string, RunRef | Ref>;
  promptInput?: PromptInput;
}

export interface CommandCallProcedureOptions {
  session?: ProcedureSessionMode;
}

export type UiCardKind = "proposal" | "summary" | "checkpoint" | "report" | "notification";

export interface UiStatusParams {
  procedure?: string;
  phase?: string;
  message: string;
  iteration?: string;
  autoApprove?: boolean;
  waiting?: boolean;
}

export interface UiCardParams {
  kind: UiCardKind;
  title: string;
  markdown: string;
}

export interface UiApi {
  text(text: string): void;
  info(text: string): void;
  warning(text: string): void;
  error(text: string): void;
  status(params: UiStatusParams): void;
  card(params: UiCardParams): void;
}

export interface BoundAgentInvocationApi {
  run(prompt: string, options?: Omit<CommandCallAgentOptions, "session">): Promise<RunResult<string>>;
  run<T extends KernelValue>(
    prompt: string,
    descriptor: TypeDescriptor<T>,
    options?: Omit<CommandCallAgentOptions, "session">,
  ): Promise<RunResult<T>>;
}

export interface AgentInvocationApi {
  run(prompt: string, options?: CommandCallAgentOptions): Promise<RunResult<string>>;
  run<T extends KernelValue>(
    prompt: string,
    descriptor: TypeDescriptor<T>,
    options?: CommandCallAgentOptions,
  ): Promise<RunResult<T>>;
  session(mode: AgentSessionMode): BoundAgentInvocationApi;
}

export interface ProcedureInvocationApi {
  run<T extends KernelValue = KernelValue>(
    name: string,
    prompt: string,
    options?: CommandCallProcedureOptions,
  ): Promise<RunResult<T>>;
}

export interface ProcedureApi {
  readonly cwd: string;
  readonly sessionId: string;
  readonly promptInput?: ProcedurePromptInput;
  readonly agent: AgentInvocationApi;
  readonly state: StateApi;
  readonly ui: UiApi;
  readonly procedures: ProcedureInvocationApi;
  readonly session: SessionApi;
  assertNotCancelled(): void;
}
