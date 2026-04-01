import { stringifyCompactShape } from "./data-shape.ts";
import { createValueRef, summarizeText } from "./session-store.ts";
import type { SessionStore } from "./session-store.ts";
import type { CellRef, JsonValue, ValueRef } from "./types.ts";

const DEFAULT_MAX_CARDS = 3;
const RECENT_SCAN_LIMIT = 200;

export interface ProcedureMemoryCard {
  cell: CellRef;
  procedure: string;
  input: string;
  summary?: string;
  memory?: string;
  dataRef?: ValueRef;
  displayRef?: ValueRef;
  dataShape?: JsonValue;
  dataPreview?: string;
  explicitDataSchema?: object;
  createdAt: string;
}

export function collectUnsyncedProcedureMemoryCards(
  store: SessionStore,
  syncedCellIds: ReadonlySet<string>,
  options: { maxCards?: number } = {},
): ProcedureMemoryCard[] {
  const maxCards = options.maxCards ?? DEFAULT_MAX_CARDS;
  const summaries = store.recent({ limit: RECENT_SCAN_LIMIT });
  const unsynced: ProcedureMemoryCard[] = [];

  for (const summary of summaries) {
    if (syncedCellIds.has(summary.cell.cellId)) {
      continue;
    }

    const record = store.readCell(summary.cell);
    if (record.meta.kind !== "top_level" || record.procedure === "default") {
      continue;
    }

    const memory = deriveProcedureMemory(record.output.memory, record.output.summary, record.output.display);
    const dataRef = record.output.data !== undefined
      ? createValueRef(summary.cell, "output.data")
      : undefined;
    const displayRef = record.output.display !== undefined
      ? createValueRef(summary.cell, "output.display")
      : undefined;

    unsynced.push({
      cell: summary.cell,
      procedure: record.procedure,
      input: record.input,
      summary: record.output.summary,
      memory,
      dataRef,
      displayRef,
      dataShape: summary.dataShape,
      dataPreview: buildDataPreview(record.output.data),
      explicitDataSchema: record.output.explicitDataSchema,
      createdAt: record.meta.createdAt,
    });

    if (unsynced.length >= maxCards) {
      break;
    }
  }

  return unsynced.reverse();
}

export function renderProcedureMemoryPreamble(cards: ProcedureMemoryCard[]): string | undefined {
  if (cards.length === 0) {
    return undefined;
  }

  const lines = [
    "Nanoboss session memory update:",
    "",
  ];

  for (const card of cards) {
    lines.push(`- procedure: /${card.procedure}`);
    lines.push(`- input: ${summarizeText(card.input, 140)}`);

    if (card.summary) {
      lines.push(`- summary: ${summarizeText(card.summary, 220)}`);
    }

    if (card.memory) {
      lines.push(`- memory: ${summarizeText(card.memory, 280)}`);
    }

    if (card.dataRef) {
      lines.push(`- result_ref: ${formatValueRef(card.dataRef)}`);
    }

    if (card.displayRef) {
      lines.push(`- display_ref: ${formatValueRef(card.displayRef)}`);
    }

    if (card.dataPreview) {
      lines.push(`- data_preview: ${card.dataPreview}`);
    }

    const shape = stringifyCompactShape(card.dataShape, 220);
    if (shape) {
      lines.push(`- data_shape: ${shape}`);
    }

    if (card.explicitDataSchema) {
      const schema = summarizeText(JSON.stringify(card.explicitDataSchema), 220);
      lines.push(`- explicit_data_schema: ${schema}`);
    }

    lines.push("");
  }

  lines.push(renderSessionToolGuidance());
  return lines.join("\n").trimEnd();
}

export function hasTopLevelNonDefaultProcedureHistory(store: SessionStore): boolean {
  const summaries = store.recent({ limit: RECENT_SCAN_LIMIT });
  return summaries.some((summary) => {
    const record = store.readCell(summary.cell);
    return record.meta.kind === "top_level" && record.procedure !== "default";
  });
}

export function renderSessionToolGuidance(): string {
  return [
    "Nanoboss session tool guidance:",
    "- For prior stored procedure results, prefer the nanoboss session MCP tools over filesystem inspection.",
    "- Available tools: session_recent, session_last, cell_get, ref_read, ref_stat, get_schema, ref_write_to_file.",
    "- Retrieval recipe: call session_recent(...) or session_last(), inspect the summary/dataRef, then call ref_read(result_ref). If that returns nested refs such as critique or answer, call ref_read on those refs too.",
    "- Do not inspect ~/.nanoboss/sessions directly unless the session MCP tools fail.",
  ].join("\n");
}

function deriveProcedureMemory(
  memory: string | undefined,
  summary: string | undefined,
  display: string | undefined,
): string | undefined {
  if (memory && memory.trim()) {
    return memory.trim();
  }

  if (summary && summary.trim()) {
    return summary.trim();
  }

  if (display && display.trim()) {
    return summarizeText(display, 220);
  }

  return undefined;
}

function buildDataPreview(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const entries = Object.entries(data)
    .filter(([, value]) => value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string")
    .slice(0, 6)
    .map(([key, value]) => [key, typeof value === "string" ? summarizeText(value, 80) : value] as const);

  if (entries.length === 0) {
    return undefined;
  }

  return summarizeText(JSON.stringify(Object.fromEntries(entries)), 220);
}

function formatValueRef(valueRef: ValueRef): string {
  return [
    `session=${valueRef.cell.sessionId}`,
    `cell=${valueRef.cell.cellId}`,
    `path=${valueRef.path}`,
  ].join(" ");
}
