import type { AutocompleteItem } from "./pi-tui.ts";

import {
  isKnownAgentProvider,
} from "@nanoboss/agent-acp";
import type { DownstreamAgentSelection } from "@nanoboss/contracts";
import type { TuiExtensionStatus } from "@nanoboss/tui-extension-catalog";
import type { ToolCardThemeMode } from "./theme.ts";

export const LOCAL_TUI_COMMANDS = [
  { name: "/new", description: "Start a new session" },
  { name: "/end", description: "Exit the interactive frontend" },
  { name: "/quit", description: "Exit the interactive frontend" },
  { name: "/exit", description: "Exit the interactive frontend" },
  { name: "/model", description: "Pick or change the downstream model" },
  { name: "/extensions", description: "List loaded TUI extensions" },
  { name: "/dark", description: "Use dark tool card backgrounds" },
  { name: "/light", description: "Use light tool card backgrounds" },
] as const;

function toLocalAutocompleteItems(): AutocompleteItem[] {
  return LOCAL_TUI_COMMANDS.map((command) => ({
    value: command.name,
    label: command.name,
    description: command.description,
  }));
}

export function isExitRequest(trimmed: string): boolean {
  return trimmed === "exit" || trimmed === "quit" || trimmed === "/end" || trimmed === "/quit" || trimmed === "/exit";
}

export function shouldDisableEditorSubmit(inputDisabled: boolean, text: string): boolean {
  return inputDisabled && text.trim().length === 0;
}

export function isNewSessionRequest(trimmed: string): boolean {
  return trimmed === "/new";
}

export function isModelPickerRequest(trimmed: string): boolean {
  return trimmed === "/model";
}

export function isExtensionsListRequest(trimmed: string): boolean {
  return trimmed === "/extensions";
}

/**
 * Legacy one-line-per-extension formatter for the `/extensions` slash
 * command. Retained as a public export for backwards compatibility with
 * any out-of-tree consumers; the live TUI pathway now renders the list
 * as a `nb/card@1` procedure panel via `formatExtensionsCardMarkdown`.
 *
 * Layout:
 *   [extensions] <name>@<version> [<scope>] <status> bindings=N chrome=N activityBar=N panels=N
 * For failed extensions the error message is appended after `error=…`.
 * When no extensions are loaded a single summary line is returned so
 * the command produces at least one visible line.
 */
export function formatExtensionsList(entries: readonly TuiExtensionStatus[]): string[] {
  if (entries.length === 0) {
    return ["[extensions] no extensions loaded"];
  }

  return entries.map((entry) => {
    const parts: string[] = [];
    const version = entry.metadata.version ? `@${entry.metadata.version}` : "";
    parts.push(`[extensions] ${entry.metadata.name}${version} [${entry.scope}] ${entry.status}`);
    const counts = entry.contributions;
    if (counts) {
      parts.push(
        `bindings=${counts.bindings}`,
        `chrome=${counts.chromeContributions}`,
        `activityBar=${counts.activityBarSegments}`,
        `panels=${counts.panelRenderers}`,
      );
    }
    if (entry.status === "failed" && entry.error) {
      parts.push(`error=${entry.error.message}`);
    }
    return parts.join(" ");
  });
}

export interface ExtensionsCardPayload {
  title: string;
  markdown: string;
  severity: "info" | "warn" | "error";
}

/**
 * Format the output of `/extensions` as a `nb/card@1` payload rendered
 * inline in the transcript (see `controller.emitExtensionsList`). Using
 * a markdown card instead of the status line makes the list persistently
 * visible in the chat, matching the user's mental model of "/command
 * output goes into the chat".
 *
 * Severity escalates to `warn` when any extension failed to activate so
 * the card renders with a warning tone, drawing the eye to the error
 * lines. An empty registry still produces a card so the user never sees
 * a silent no-op.
 */
export function formatExtensionsCard(
  entries: readonly TuiExtensionStatus[],
): ExtensionsCardPayload {
  if (entries.length === 0) {
    return {
      title: "Extensions",
      markdown: "_No extensions loaded._",
      severity: "info",
    };
  }

  const lines: string[] = [];
  let anyFailed = false;
  for (const entry of entries) {
    if (entry.status === "failed") anyFailed = true;
    const version = entry.metadata.version ? `@${entry.metadata.version}` : "";
    const statusIcon = entry.status === "failed" ? "✗" : "✓";
    lines.push(`- ${statusIcon} **${entry.metadata.name}**${version} — \`${entry.scope}\` — ${entry.status}`);
    const counts = entry.contributions;
    if (counts) {
      lines.push(
        `    bindings=${counts.bindings} · chrome=${counts.chromeContributions} · activityBar=${counts.activityBarSegments} · panels=${counts.panelRenderers}`,
      );
    }
    if (entry.metadata.description) {
      lines.push(`    ${entry.metadata.description}`);
    }
    if (entry.status === "failed" && entry.error) {
      lines.push(`    error: ${entry.error.message}`);
    }
  }

  return {
    title: "Extensions",
    markdown: lines.join("\n"),
    severity: anyFailed ? "warn" : "info",
  };
}

export function parseToolCardThemeCommand(trimmed: string): ToolCardThemeMode | undefined {
  if (trimmed === "/dark") {
    return "dark";
  }

  if (trimmed === "/light") {
    return "light";
  }

  return undefined;
}

export function parseModelSelectionCommand(line: string): DownstreamAgentSelection | undefined {
  if (!line.startsWith("/model ")) {
    return undefined;
  }

  const [, rawProvider, ...rest] = line.split(/\s+/);
  if (!rawProvider || !isKnownAgentProvider(rawProvider)) {
    return undefined;
  }

  const model = rest.join(" ").trim();
  if (!model) {
    return undefined;
  }

  return {
    provider: rawProvider,
    model,
  };
}
