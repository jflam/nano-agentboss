import { mkdtempSync, rmSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { createSessionMcpApi } from "../../src/session-mcp.ts";
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

describe("session MCP API", () => {
  test("supports recent lookup, exact cell reads, ref reads, and schema lookup", () => {
    const rootDir = mkdtempSync(join(process.cwd(), ".tmp-session-mcp-"));
    tempDirs.push(rootDir);

    const store = new SessionStore({
      sessionId: "session-mcp",
      cwd: process.cwd(),
      rootDir,
    });

    const critiqueCell = store.startCell({
      procedure: "callAgent",
      input: "critique",
      kind: "agent",
    });
    const critiqueResult = store.finalizeCell(critiqueCell, {
      data: {
        verdict: "mixed",
        issues: ["missing evidence"],
      },
      display: "critique display",
      summary: "critique summary",
    });

    const reviewCell = store.startCell({
      procedure: "second-opinion",
      input: "review the code",
      kind: "top_level",
    });
    const reviewResult = store.finalizeCell(reviewCell, {
      data: {
        subject: "review the code",
        critique: critiqueResult.dataRef!,
        verdict: "mixed",
      },
      display: "review display",
      summary: "review summary",
      memory: "The main issue was missing evidence.",
      explicitDataSchema: {
        type: "object",
        properties: {
          subject: { type: "string" },
          critique: { type: "object" },
          verdict: { enum: ["sound", "mixed", "flawed"] },
        },
      },
    });

    const api = createSessionMcpApi({
      sessionId: "session-mcp",
      cwd: process.cwd(),
      rootDir,
    });

    const recent = api.sessionRecent({ procedure: "second-opinion", limit: 5 });
    expect(recent).toHaveLength(1);
    expect(recent[0]?.summary).toBe("review summary");
    expect(recent[0]?.memory).toBe("The main issue was missing evidence.");
    expect(recent[0]?.dataShape).toEqual({
      subject: "string",
      critique: "ValueRef",
      verdict: "mixed",
    });

    expect(api.cellGet(reviewResult.cell).output.summary).toBe("review summary");

    const manifest = api.refRead(reviewResult.dataRef!);
    expect(manifest).toEqual({
      subject: "review the code",
      critique: critiqueResult.dataRef,
      verdict: "mixed",
    });

    expect(api.refRead((manifest as { critique: typeof critiqueResult.dataRef }).critique!)).toEqual({
      verdict: "mixed",
      issues: ["missing evidence"],
    });

    expect(api.refStat(reviewResult.dataRef!).type).toBe("object");

    const schema = api.getSchema({ cellRef: reviewResult.cell });
    expect(schema.dataShape).toEqual({
      subject: "string",
      critique: "ValueRef",
      verdict: "mixed",
    });
    expect(schema.explicitDataSchema).toEqual({
      type: "object",
      properties: {
        subject: { type: "string" },
        critique: { type: "object" },
        verdict: { enum: ["sound", "mixed", "flawed"] },
      },
    });
  });
});
