import type { StoredSessionSummary } from "../../stored-sessions.ts";

import type { NanobossTuiTheme } from "../theme.ts";
import { promptWithSelectList } from "./select-overlay.ts";

export async function promptForStoredSessionSelection(
  theme: NanobossTuiTheme,
  sessions: StoredSessionSummary[],
  cwd: string,
): Promise<StoredSessionSummary | undefined> {
  const selectedId = await promptWithSelectList(theme, {
    title: `Resume nanoboss session — ${cwd}`,
    items: sessions.map((session) => ({
      value: session.sessionId,
      label: formatSessionLine(session, cwd),
      description: formatSessionDetailLine(session),
    })),
    footer: "↑↓ navigate • enter resume • esc cancel",
    maxVisible: 10,
  });

  return sessions.find((session) => session.sessionId === selectedId);
}

function formatSessionLine(session: StoredSessionSummary, cwd: string): string {
  const markers: string[] = [];
  if (session.cwd === cwd) {
    markers.push("here");
  }
  if (session.hasNativeResume) {
    markers.push("native");
  }

  const prefix = markers.length > 0 ? `[${markers.join(",")}] ` : "";
  const timestamp = formatTimestamp(session.updatedAt);
  const prompt = summarize(session.initialPrompt ?? "(no turns yet)", 96);
  return `${prefix}${timestamp} ${session.sessionId.slice(0, 8)} ${prompt}`;
}

function formatSessionDetailLine(session: StoredSessionSummary): string {
  const parts = [session.cwd || "cwd unknown"];
  if (session.defaultAgentSelection) {
    parts.push(
      session.defaultAgentSelection.model
        ? `${session.defaultAgentSelection.provider}:${session.defaultAgentSelection.model}`
        : session.defaultAgentSelection.provider,
    );
  }
  return parts.join(" • ");
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function summarize(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}
