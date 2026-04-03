import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import { getNanobossHome, getSessionDir } from "./config.ts";
import type { DownstreamAgentSelection, DownstreamAgentProvider } from "./types.ts";

const SESSION_RECORD_FILE = "session.json";

export interface StoredSessionRecord {
  sessionId: string;
  cwd: string;
  rootDir: string;
  createdAt: string;
  updatedAt: string;
  initialPrompt?: string;
  lastPrompt?: string;
  defaultAgentSelection?: DownstreamAgentSelection;
  defaultAcpSessionId?: string;
}

export interface StoredSessionSummary extends StoredSessionRecord {
  hasMetadata: boolean;
  hasNativeResume: boolean;
}

interface DerivedSessionDetails {
  createdAt: string;
  updatedAt: string;
  initialPrompt?: string;
  lastPrompt?: string;
  defaultAgentSelection?: DownstreamAgentSelection;
}

export function getStoredSessionRecordPath(sessionId: string, rootDir?: string): string {
  return join(rootDir ?? getSessionDir(sessionId), SESSION_RECORD_FILE);
}

export function writeStoredSessionRecord(record: StoredSessionRecord): void {
  mkdirSync(record.rootDir, { recursive: true });
  writeFileSync(
    getStoredSessionRecordPath(record.sessionId, record.rootDir),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

export function readStoredSessionRecord(
  sessionId: string,
  rootDir?: string,
): StoredSessionRecord | undefined {
  try {
    const raw = JSON.parse(readFileSync(getStoredSessionRecordPath(sessionId, rootDir), "utf8")) as Record<string, unknown>;
    const resolvedRootDir = asNonEmptyString(raw.rootDir) ?? rootDir ?? getSessionDir(sessionId);
    const resolvedSessionId = asNonEmptyString(raw.sessionId) ?? sessionId;
    const createdAt = asNonEmptyString(raw.createdAt);
    const updatedAt = asNonEmptyString(raw.updatedAt);
    const cwd = asNonEmptyString(raw.cwd);

    if (!resolvedSessionId || !resolvedRootDir || !cwd || !createdAt || !updatedAt) {
      return undefined;
    }

    return {
      sessionId: resolvedSessionId,
      cwd,
      rootDir: resolvedRootDir,
      createdAt,
      updatedAt,
      initialPrompt: asNonEmptyString(raw.initialPrompt),
      lastPrompt: asNonEmptyString(raw.lastPrompt),
      defaultAgentSelection: parseDownstreamAgentSelection(raw.defaultAgentSelection),
      defaultAcpSessionId: asNonEmptyString(raw.defaultAcpSessionId),
    };
  } catch {
    return undefined;
  }
}

export function listStoredSessions(): StoredSessionSummary[] {
  const sessionsDir = join(getNanobossHome(), "sessions");
  if (!existsSync(sessionsDir)) {
    return [];
  }

  return readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readStoredSessionSummary(join(sessionsDir, entry.name)))
    .filter((entry): entry is StoredSessionSummary => entry !== undefined)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function findStoredSession(sessionId: string): StoredSessionSummary | undefined {
  const rootDir = getSessionDir(sessionId);
  if (!existsSync(rootDir)) {
    return undefined;
  }

  return readStoredSessionSummary(rootDir);
}

export function resolveMostRecentStoredSession(cwd: string): StoredSessionSummary | undefined {
  const sessions = listStoredSessions();
  const matching = sessions.filter((session) => session.cwd === cwd);
  return matching[0] ?? sessions[0];
}

function readStoredSessionSummary(rootDir: string): StoredSessionSummary | undefined {
  const sessionId = basename(rootDir);
  const stored = readStoredSessionRecord(sessionId, rootDir);
  const derived = deriveSessionDetails(rootDir);

  if (!stored && !derived) {
    return undefined;
  }

  const stats = statSync(rootDir, { throwIfNoEntry: false });
  const fallbackTimestamp = stats
    ? new Date(stats.mtimeMs || Date.now()).toISOString()
    : new Date().toISOString();

  return {
    sessionId,
    cwd: stored?.cwd ?? "",
    rootDir,
    createdAt: stored?.createdAt ?? derived?.createdAt ?? fallbackTimestamp,
    updatedAt: stored?.updatedAt ?? derived?.updatedAt ?? fallbackTimestamp,
    initialPrompt: stored?.initialPrompt ?? derived?.initialPrompt,
    lastPrompt: stored?.lastPrompt ?? derived?.lastPrompt,
    defaultAgentSelection: stored?.defaultAgentSelection ?? derived?.defaultAgentSelection,
    defaultAcpSessionId: stored?.defaultAcpSessionId,
    hasMetadata: Boolean(stored),
    hasNativeResume: Boolean(stored?.defaultAcpSessionId),
  };
}

function deriveSessionDetails(rootDir: string): DerivedSessionDetails | undefined {
  const cellsDir = join(rootDir, "cells");
  if (!existsSync(cellsDir)) {
    return undefined;
  }

  const fileNames = readdirSync(cellsDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort();
  if (fileNames.length === 0) {
    return undefined;
  }

  const cells = fileNames
    .map((fileName) => readStoredCell(join(cellsDir, fileName)))
    .filter((cell): cell is StoredCellSummary => cell !== undefined)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  if (cells.length === 0) {
    return undefined;
  }

  const topLevelCells = cells.filter((cell) => cell.kind === "top_level");
  const firstCell = topLevelCells[0] ?? cells[0];
  const lastCell = topLevelCells[topLevelCells.length - 1] ?? cells[cells.length - 1];
  const lastSelectionCell = [...topLevelCells].reverse().find((cell) => cell.defaultAgentSelection);

  return {
    createdAt: firstCell?.createdAt ?? cells[0]!.createdAt,
    updatedAt: lastCell?.createdAt ?? cells[cells.length - 1]!.createdAt,
    initialPrompt: firstCell ? formatStoredPrompt(firstCell) : undefined,
    lastPrompt: lastCell ? formatStoredPrompt(lastCell) : undefined,
    defaultAgentSelection: lastSelectionCell?.defaultAgentSelection,
  };
}

interface StoredCellSummary {
  procedure: string;
  input: string;
  kind: string;
  createdAt: string;
  defaultAgentSelection?: DownstreamAgentSelection;
}

function readStoredCell(path: string): StoredCellSummary | undefined {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const procedure = asNonEmptyString(raw.procedure);
    const input = asNonEmptyString(raw.input) ?? "";
    const meta = asRecord(raw.meta);
    const createdAt = asNonEmptyString(meta?.createdAt);
    const kind = asNonEmptyString(meta?.kind);

    if (!procedure || !createdAt || !kind) {
      return undefined;
    }

    return {
      procedure,
      input,
      kind,
      createdAt,
      defaultAgentSelection: parseDownstreamAgentSelection(meta?.defaultAgentSelection),
    };
  } catch {
    return undefined;
  }
}

function formatStoredPrompt(cell: StoredCellSummary): string {
  if (cell.procedure === "default") {
    return cell.input;
  }

  return cell.input ? `/${cell.procedure} ${cell.input}` : `/${cell.procedure}`;
}

function parseDownstreamAgentSelection(value: unknown): DownstreamAgentSelection | undefined {
  const record = asRecord(value);
  const provider = asProvider(record?.provider);
  if (!provider) {
    return undefined;
  }

  const model = asNonEmptyString(record?.model);
  return model
    ? { provider, model }
    : { provider };
}

function asProvider(value: unknown): DownstreamAgentProvider | undefined {
  return value === "claude" || value === "gemini" || value === "codex" || value === "copilot"
    ? value
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
