import {
  asRecord,
  extractPathLike,
  firstString,
} from "@nanoboss/procedure-sdk";
import type { UiToolCall } from "../state.ts";
import type { NanobossTuiTheme } from "../theme.ts";
import { getLanguageFromPath } from "../theme.ts";
import type { ToolPreviewBlock } from "../tool-preview.ts";
import {
  formatExpandedToolHeader,
  getExpandedToolErrorBlock,
  getExpandedToolResultBlock,
} from "./tool-card-expanded.ts";

export {
  formatExpandedToolHeader,
  getExpandedToolErrorBlock,
  getExpandedToolInputBlock,
  getExpandedToolResultBlock,
} from "./tool-card-expanded.ts";

const DEFAULT_COLLAPSED_LINES = 6;

export interface RenderedToolCard {
  lines: string[];
}

export function renderPreviewToolCard(
  theme: NanobossTuiTheme,
  toolCall: UiToolCall,
  expanded: boolean,
  options: {
    collapsedLines: number;
  },
): RenderedToolCard {
  const { collapsedLines } = options;

  return {
    lines: joinToolContent(
      formatToolHeader(theme, expanded ? formatExpandedToolHeader(toolCall) : toolCall.callPreview?.header, toolCall.title),
      formatPreviewBody(
        theme,
        expanded ? getExpandedToolResultBlock(toolCall) ?? toolCall.resultPreview : toolCall.resultPreview,
        expanded,
        { collapsedLines },
      ),
      formatErrorLines(
        theme,
        expanded ? getExpandedToolErrorBlock(toolCall) ?? toolCall.errorPreview : toolCall.errorPreview,
        expanded,
        collapsedLines,
      ),
      formatWarnings(theme, toolCall.resultPreview),
      formatWarnings(theme, toolCall.errorPreview),
      formatToolDurationLine(theme, toolCall),
    ),
  };
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

export function formatToolDurationLine(theme: NanobossTuiTheme, toolCall: UiToolCall): string | undefined {
  if (toolCall.durationMs === undefined) {
    return undefined;
  }

  return theme.toolCardMeta(`Took ${formatDuration(toolCall.durationMs)}`);
}

export function getCanonicalToolName(toolCall: Pick<UiToolCall, "toolName">): string | undefined {
  return toolCall.toolName?.trim().toLowerCase() || undefined;
}

export function formatToolHeader(theme: NanobossTuiTheme, header: string | undefined, defaultTitle: string): string {
  const text = stripWrappingBackticks((header?.trim() || defaultTitle).trim());

  if (text.startsWith("$ ")) {
    return `${theme.toolCardTitle("$")} ${theme.toolCardBody(text.slice(2))}`;
  }

  const match = text.match(/^(read|write|edit|grep|find|ls)(?:\s+(.*))?$/i);
  if (!match) {
    return theme.toolCardTitle(text);
  }

  const command = match[1];
  const rest = match[2];
  if (!command) {
    return theme.toolCardTitle(text);
  }
  const commandText = theme.toolCardTitle(command);
  if (!rest) {
    return commandText;
  }

  if (command.toLowerCase() === "read") {
    const rangeMatch = rest.match(/^(.*?)(:\d+(?:-\d+)?)$/);
    if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
      return `${commandText} ${theme.toolCardAccent(rangeMatch[1])}${theme.toolCardWarning(rangeMatch[2])}`;
    }
  }

  return `${commandText} ${theme.toolCardAccent(stripWrappingBackticks(rest))}`;
}

function stripWrappingBackticks(text: string): string {
  return text.replace(/^`+|`+$/g, "");
}

export function formatPreviewBody(
  theme: NanobossTuiTheme,
  block: ToolPreviewBlock | undefined,
  expanded: boolean,
  options: {
    collapsedLines?: number;
    lineFormatter?: (theme: NanobossTuiTheme, line: string) => string;
  } = {},
): string[] {
  if (!block?.bodyLines?.length) {
    return [];
  }

  const collapsedLines = options.collapsedLines ?? DEFAULT_COLLAPSED_LINES;
  const formatter = options.lineFormatter
    ?? (looksLikeDiffBlock(block.bodyLines)
      ? formatDiffLine
      : ((currentTheme: NanobossTuiTheme, line: string) => currentTheme.toolCardBody(line)));
  const visibleLines = expanded ? block.bodyLines : block.bodyLines.slice(0, collapsedLines);
  const lines = visibleLines.map((line) => formatter(theme, line));

  if (block.truncated && !expanded && block.bodyLines.length > visibleLines.length) {
    lines.push(theme.toolCardMeta(`... (${block.bodyLines.length - visibleLines.length} more lines, ctrl+o to expand)`));
  }

  return lines;
}

export function formatCodePreviewBody(
  theme: NanobossTuiTheme,
  toolCall: UiToolCall,
  block: ToolPreviewBlock | undefined,
  expanded: boolean,
  options: {
    collapsedLines?: number;
  } = {},
): string[] {
  if (!block?.bodyLines?.length) {
    return [];
  }

  const collapsedLines = options.collapsedLines ?? DEFAULT_COLLAPSED_LINES;
  if (looksLikeDiffBlock(block.bodyLines)) {
    return formatPreviewBody(theme, block, expanded, {
      collapsedLines,
      lineFormatter: formatDiffLine,
    });
  }

  const { shouldHighlight, language } = getToolCodeContext(toolCall);
  if (!shouldHighlight) {
    return formatPreviewBody(theme, block, expanded, options);
  }

  const renderedLines = theme.highlightCode(block.bodyLines.join("\n"), language);
  const visibleLines = expanded ? renderedLines : renderedLines.slice(0, collapsedLines);
  const lines = [...visibleLines];

  if (block.truncated && !expanded && renderedLines.length > visibleLines.length) {
    lines.push(theme.toolCardMeta(`... (${renderedLines.length - visibleLines.length} more lines, ctrl+o to expand)`));
  }

  return lines;
}

export function formatWarnings(theme: NanobossTuiTheme, block: ToolPreviewBlock | undefined): string[] {
  return (block?.warnings ?? []).map((warning) =>
    theme.toolCardWarning(warning.startsWith("[") ? warning : `[${warning}]`),
  );
}

export function formatDiffLine(theme: NanobossTuiTheme, line: string): string {
  if (
    line.startsWith("diff --git ")
    || line.startsWith("index ")
    || line.startsWith("--- ")
    || line.startsWith("+++ ")
    || line.startsWith("*** ")
  ) {
    return theme.toolCardMeta(line);
  }

  if (line.startsWith("@@")) {
    return theme.toolCardAccent(line);
  }

  if (line.startsWith("+")) {
    return theme.toolCardSuccess(line);
  }

  if (line.startsWith("-")) {
    return theme.toolCardError(line);
  }

  return theme.toolCardBody(line);
}

export function formatErrorLines(
  theme: NanobossTuiTheme,
  block: ToolPreviewBlock | undefined,
  expanded: boolean,
  collapsedLines = DEFAULT_COLLAPSED_LINES,
): string[] {
  return formatPreviewBody(theme, block, expanded, {
    collapsedLines,
    lineFormatter: (currentTheme, line) => currentTheme.toolCardError(line),
  });
}

function getToolCodeContext(toolCall: UiToolCall): { shouldHighlight: boolean; language?: string } {
  const toolName = getCanonicalToolName(toolCall);
  const inputRecord = asRecord(toolCall.rawInput);
  const outputRecord = asRecord(toolCall.rawOutput);
  const explicitLanguage = firstString(
    inputRecord?.language,
    inputRecord?.lang,
    outputRecord?.language,
    outputRecord?.lang,
  );
  const path = firstString(extractPathLike(inputRecord), extractPathLike(outputRecord));
  const inferredLanguage = path ? getLanguageFromPath(path) : undefined;

  return {
    shouldHighlight: toolName === "read" || toolName === "write" || explicitLanguage !== undefined || inferredLanguage !== undefined,
    language: explicitLanguage ?? inferredLanguage,
  };
}

function looksLikeDiffBlock(lines: string[]): boolean {
  let hasUnifiedFileHeaders = false;
  let hasUnifiedHunk = false;
  let hasGitDiffHeader = false;
  let hasApplyPatchHeader = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      hasGitDiffHeader = true;
    } else if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      hasUnifiedFileHeaders = true;
    } else if (line.startsWith("@@")) {
      hasUnifiedHunk = true;
    } else if (
      line.startsWith("*** Begin Patch")
      || line.startsWith("*** Update File:")
      || line.startsWith("*** Add File:")
      || line.startsWith("*** Delete File:")
      || line.startsWith("*** Move to:")
    ) {
      hasApplyPatchHeader = true;
    }
  }

  return hasApplyPatchHeader || (hasUnifiedFileHeaders && hasUnifiedHunk) || (hasGitDiffHeader && (hasUnifiedFileHeaders || hasUnifiedHunk));
}

export function joinToolContent(...groups: Array<string[] | string | undefined>): string[] {
  const lines: string[] = [];

  for (const group of groups) {
    const normalized = typeof group === "string"
      ? [group]
      : Array.isArray(group)
        ? group.filter((line) => line.length > 0)
        : [];
    if (normalized.length === 0) {
      continue;
    }

    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(...normalized);
  }

  return lines;
}
