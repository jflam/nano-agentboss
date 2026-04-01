import { mkdtempSync, rmSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  collectUnsyncedProcedureMemoryCards,
  renderProcedureMemoryPreamble,
} from "../../src/memory-cards.ts";
import { SessionStore } from "../../src/session-store.ts";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

describe("procedure memory cards", () => {
  test("selects only top-level non-default cells and renders a bounded preamble", () => {
    const rootDir = mkdtempSync(join(process.cwd(), ".tmp-memory-cards-"));
    tempDirs.push(rootDir);

    const store = new SessionStore({
      sessionId: "session-1",
      cwd: process.cwd(),
      rootDir,
    });

    const reviewCell = store.startCell({
      procedure: "review",
      input: "check the diff",
      kind: "top_level",
    });
    const reviewResult = store.finalizeCell(reviewCell, {
      data: {
        subject: "diff",
        verdict: "mixed",
        critiqueMainIssue: "missing edge-case coverage",
      },
      display: "full rendered review output that should not be injected wholesale",
      summary: "review summary",
      memory: "Most important issue was missing edge-case coverage.",
    });

    store.finalizeCell(
      store.startCell({
        procedure: "default",
        input: "hello",
        kind: "top_level",
      }),
      {
        display: "hi",
      },
    );

    store.finalizeCell(
      store.startCell({
        procedure: "child-proc",
        input: "internal",
        kind: "procedure",
        parentCellId: reviewCell.cell.cellId,
      }),
      {
        display: "internal child result",
        summary: "internal",
      },
    );

    store.finalizeCell(
      store.startCell({
        procedure: "callAgent",
        input: "internal agent",
        kind: "agent",
        parentCellId: reviewCell.cell.cellId,
      }),
      {
        display: "internal agent result",
        summary: "agent",
      },
    );

    const cards = collectUnsyncedProcedureMemoryCards(store, new Set());
    expect(cards).toHaveLength(1);
    expect(cards[0]?.procedure).toBe("review");
    expect(cards[0]?.cell).toEqual(reviewResult.cell);
    expect(cards[0]?.memory).toContain("Most important issue");
    expect(cards[0]?.dataShape).toEqual({
      subject: "diff",
      verdict: "mixed",
      critiqueMainIssue: "string",
    });

    const preamble = renderProcedureMemoryPreamble(cards);
    expect(preamble).toContain("Nanoboss session memory update:");
    expect(preamble).toContain("procedure: /review");
    expect(preamble).toContain("result_ref:");
    expect(preamble).toContain("display_ref:");
    expect(preamble).toContain("data_preview:");
    expect(preamble).toContain("critiqueMainIssue");
    expect(preamble).toContain("Do not inspect ~/.nanoboss/sessions directly unless the session MCP tools fail.");
    expect(preamble).not.toContain("full rendered review output that should not be injected wholesale");
  });

  test("falls back from memory to summary", () => {
    const rootDir = mkdtempSync(join(process.cwd(), ".tmp-memory-cards-"));
    tempDirs.push(rootDir);

    const store = new SessionStore({
      sessionId: "session-2",
      cwd: process.cwd(),
      rootDir,
    });

    store.finalizeCell(
      store.startCell({
        procedure: "review",
        input: "check the diff",
        kind: "top_level",
      }),
      {
        display: "display text",
        summary: "review summary fallback",
      },
    );

    const cards = collectUnsyncedProcedureMemoryCards(store, new Set());
    expect(cards[0]?.memory).toBe("review summary fallback");
  });
});
