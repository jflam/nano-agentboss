import type { AutocompleteItem } from "./pi-tui.ts";

import {
  isKnownAgentProvider,
} from "@nanoboss/agent-acp";
import type { DownstreamAgentSelection } from "@nanoboss/contracts";
import type { TuiExtensionStatus } from "@nanoboss/tui-extension-catalog";
import type { UiInputDisabledReason } from "./state.ts";
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

export function shouldDisableEditorSubmit(
  inputDisabled: boolean,
  inputDisabledReason: UiInputDisabledReason | undefined,
  text: string,
): boolean {
  if (!inputDisabled) {
    return false;
  }

  if (inputDisabledReason === "local") {
    return true;
  }

  return text.trim().length === 0;
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

interface ExtensionsCardPayload {
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

    // Prefer the declared `provides` IDs (e.g. "nb/card@1") so the user
    // sees what the extension actually contributes. Fall back to the
    // runtime counts when `provides` was not declared.
    const provides = entry.metadata.provides ?? {};
    const counts = entry.contributions;
    const sections: { label: string; ids?: readonly string[]; count?: number }[] = [
      { label: "key bindings", ids: provides.bindings, count: counts?.bindings },
      { label: "chrome contributions", ids: provides.chromeContributions, count: counts?.chromeContributions },
      { label: "activity-bar segments", ids: provides.activityBarSegments, count: counts?.activityBarSegments },
      { label: "panel renderers", ids: provides.panelRenderers, count: counts?.panelRenderers },
    ];
    for (const section of sections) {
      const ids = section.ids ?? [];
      const count = ids.length > 0 ? ids.length : section.count ?? 0;
      if (count === 0) continue;
      if (ids.length > 0) {
        const quoted = ids.map((id) => `\`${id}\``).join(", ");
        lines.push(`    ${section.label}: ${quoted}`);
      } else {
        // No IDs declared, but the extension registered some at runtime.
        // Surface the count so the entry is not silently dropped.
        lines.push(`    ${section.label}: ${count}`);
      }
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
