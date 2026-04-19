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
 * Format the output of the `/extensions` slash command as one readable line
 * per extension. Lines route through the same status-line pathway as
 * `/help`-style commands (i.e. via `controller.showStatus`).
 *
 * Layout:
 *   [extensions] <name>@<version> [<scope>] <status> bindings=N chrome=N activityBar=N panels=N
 * For failed extensions the error message is appended after `error=…`.
 * When no extensions are loaded a single summary line is returned so users
 * are not left wondering whether the command succeeded.
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
