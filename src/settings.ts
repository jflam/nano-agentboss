import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { DownstreamAgentProvider, DownstreamAgentSelection } from "./types.ts";

export interface NanobossSettings {
  defaultAgentSelection?: DownstreamAgentSelection;
  updatedAt?: string;
}

export function getNanobossSettingsPath(): string {
  return join(getNanobossHome(), "settings.json");
}

export function readNanobossSettings(): NanobossSettings | undefined {
  try {
    const raw = JSON.parse(readFileSync(getNanobossSettingsPath(), "utf8")) as Record<string, unknown>;
    return {
      defaultAgentSelection: parseDownstreamAgentSelection(raw.defaultAgentSelection),
      updatedAt: asNonEmptyString(raw.updatedAt),
    };
  } catch {
    return undefined;
  }
}

export function readPersistedDefaultAgentSelection(): DownstreamAgentSelection | undefined {
  return readNanobossSettings()?.defaultAgentSelection;
}

export function writePersistedDefaultAgentSelection(selection: DownstreamAgentSelection): void {
  mkdirSync(getNanobossHome(), { recursive: true });
  writeFileSync(
    getNanobossSettingsPath(),
    `${JSON.stringify({
      defaultAgentSelection: selection,
      updatedAt: new Date().toISOString(),
    } satisfies NanobossSettings, null, 2)}\n`,
    "utf8",
  );
}

function getNanobossHome(): string {
  return join(process.env.HOME?.trim() || homedir(), ".nanoboss");
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
