import { mkdtempSync, rmSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  callSessionMcpTool,
  createSessionMcpApi,
  listSessionMcpTools,
} from "../../src/session-mcp.ts";
import { ProcedureRegistry } from "../../src/registry.ts";
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

function expectDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

function seedSession(rootDir: string) {
  const store = new SessionStore({
    sessionId: "session-mcp",
    cwd: process.cwd(),
    rootDir,
  });

  const reviewCell = store.startCell({
    procedure: "second-opinion",
    input: "review the code",
    kind: "top_level",
  });
  reviewCell.meta.createdAt = "2026-04-01T10:00:00.000Z";
  const planCell = store.startCell({
    procedure: "review-plan",
    input: "collect the main issues",
    kind: "procedure",
    parentCellId: reviewCell.cell.cellId,
  });
  planCell.meta.createdAt = "2026-04-01T10:00:01.000Z";
  const critiqueCell = store.startCell({
    procedure: "callAgent",
    input: "critique the code",
    kind: "agent",
    parentCellId: planCell.cell.cellId,
  });
  critiqueCell.meta.createdAt = "2026-04-01T10:00:02.000Z";
  const summaryCell = store.startCell({
    procedure: "callAgent",
    input: "summarize the review",
    kind: "agent",
    parentCellId: reviewCell.cell.cellId,
  });
  summaryCell.meta.createdAt = "2026-04-01T10:00:03.000Z";

  const critiqueResult = store.finalizeCell(critiqueCell, {
    data: {
      verdict: "mixed",
      issues: ["missing evidence"],
    },
    display: "critique display",
    summary: "critique summary",
  });
  const planResult = store.finalizeCell(planCell, {
    data: {
      critique: expectDefined(critiqueResult.dataRef, "Expected critique dataRef"),
      steps: ["inspect diff", "check tests"],
    },
    display: "plan display",
    summary: "plan summary",
  });
  const summaryResult = store.finalizeCell(summaryCell, {
    data: {
      outline: "review outline",
    },
    display: "summary display",
    summary: "summary summary",
  });
  const reviewResult = store.finalizeCell(reviewCell, {
    data: {
      subject: "review the code",
      plan: expectDefined(planResult.dataRef, "Expected plan dataRef"),
      summary: expectDefined(summaryResult.dataRef, "Expected summary dataRef"),
      verdict: "mixed",
    },
    display: "review display",
    summary: "review summary",
    memory: "The main issue was missing evidence.",
    explicitDataSchema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        plan: { type: "object" },
        summary: { type: "object" },
        verdict: { enum: ["sound", "mixed", "flawed"] },
      },
    },
  });

  store.finalizeCell(
    (() => {
      const linterCell = store.startCell({
        procedure: "linter",
        input: "lint the repo",
        kind: "top_level",
      });
      linterCell.meta.createdAt = "2026-04-01T10:00:04.000Z";
      return linterCell;
    })(),
    {
      data: {
        status: "clean",
      },
      display: "linter display",
      summary: "linter summary",
    },
  );

  return {
    critiqueResult,
    planResult,
    reviewResult,
    summaryResult,
  };
}

describe("session MCP API", () => {
  test("supports structural traversal, exact cell reads, ref reads, and schema lookup", () => {
    const rootDir = mkdtempSync(join(process.cwd(), ".tmp-session-mcp-"));
    tempDirs.push(rootDir);

    const { critiqueResult, planResult, reviewResult, summaryResult } = seedSession(rootDir);

    const api = createSessionMcpApi({
      sessionId: "session-mcp",
      cwd: process.cwd(),
      rootDir,
    });

    const recent = api.sessionRecent({ procedure: "second-opinion", limit: 5 });
    expect(recent).toHaveLength(1);
    expect(recent[0]?.summary).toBe("review summary");
    expect(recent[0]?.memory).toBe("The main issue was missing evidence.");
    expect(recent[0]?.kind).toBe("top_level");
    expect(recent[0]?.dataShape).toEqual({
      subject: "string",
      plan: "ValueRef",
      summary: "ValueRef",
      verdict: "mixed",
    });

    expect(api.topLevelRuns().map((item) => item.procedure)).toEqual([
      "linter",
      "second-opinion",
    ]);
    expect(api.cellAncestors(critiqueResult.cell).map((item) => item.cell.cellId)).toEqual([
      planResult.cell.cellId,
      reviewResult.cell.cellId,
    ]);
    expect(api.cellAncestors(critiqueResult.cell, { limit: 1 }).map((item) => item.cell.cellId)).toEqual([
      planResult.cell.cellId,
    ]);
    expect(api.cellAncestors(critiqueResult.cell, { includeSelf: true, limit: 2 }).map((item) => item.cell.cellId)).toEqual([
      critiqueResult.cell.cellId,
      planResult.cell.cellId,
    ]);
    expect(api.cellDescendants(reviewResult.cell).map((item) => item.cell.cellId)).toEqual([
      planResult.cell.cellId,
      critiqueResult.cell.cellId,
      summaryResult.cell.cellId,
    ]);
    expect(api.cellDescendants(reviewResult.cell, { kind: "agent" }).map((item) => item.cell.cellId)).toEqual([
      critiqueResult.cell.cellId,
      summaryResult.cell.cellId,
    ]);
    expect(api.cellDescendants(reviewResult.cell, { maxDepth: 1 }).map((item) => item.cell.cellId)).toEqual([
      planResult.cell.cellId,
      summaryResult.cell.cellId,
    ]);

    expect(api.cellGet(reviewResult.cell).output.summary).toBe("review summary");

    const reviewDataRef = expectDefined(reviewResult.dataRef, "Expected review dataRef");
    const manifest = api.refRead(reviewDataRef);
    expect(manifest).toEqual({
      subject: "review the code",
      plan: planResult.dataRef,
      summary: summaryResult.dataRef,
      verdict: "mixed",
    });

    const planRef = expectDefined(
      (manifest as { plan?: typeof planResult.dataRef }).plan,
      "Expected plan ref in manifest",
    );
    expect(api.refRead(planRef)).toEqual({
      critique: critiqueResult.dataRef,
      steps: ["inspect diff", "check tests"],
    });
    const summaryRef = expectDefined(
      (manifest as { summary?: typeof summaryResult.dataRef }).summary,
      "Expected summary ref in manifest",
    );
    expect(api.refRead(summaryRef)).toEqual({
      outline: "review outline",
    });

    expect(api.refStat(reviewDataRef).type).toBe("object");

    const schema = api.getSchema({ cellRef: reviewResult.cell });
    expect(schema.dataShape).toEqual({
      subject: "string",
      plan: "ValueRef",
      summary: "ValueRef",
      verdict: "mixed",
    });
    expect(schema.explicitDataSchema).toEqual({
      type: "object",
      properties: {
        subject: { type: "string" },
        plan: { type: "object" },
        summary: { type: "object" },
        verdict: { enum: ["sound", "mixed", "flawed"] },
      },
    });
  });

  test("registers and dispatches the structural MCP tools", async () => {
    const rootDir = mkdtempSync(join(process.cwd(), ".tmp-session-mcp-"));
    tempDirs.push(rootDir);

    const { critiqueResult, reviewResult } = seedSession(rootDir);

    const api = createSessionMcpApi({
      sessionId: "session-mcp",
      cwd: process.cwd(),
      rootDir,
    });

    const toolNames = listSessionMcpTools().map((tool) => tool.name);
    expect(toolNames).toContain("top_level_runs");
    expect(toolNames).toContain("cell_ancestors");
    expect(toolNames).toContain("cell_descendants");
    expect(toolNames).toContain("cell_get");
    expect(toolNames).toContain("ref_read");
    expect(toolNames).not.toContain("session_last");
    expect(toolNames).not.toContain("cell_parent");
    expect(toolNames).not.toContain("cell_children");

    expect(toolNames).toContain("procedure_list");
    expect(toolNames).toContain("procedure_get");
    expect(toolNames).toContain("procedure_dispatch");

    expect(
      await callSessionMcpTool(api, "cell_ancestors", {
        cellRef: critiqueResult.cell,
        limit: 1,
      }),
    ).toMatchObject([
      { procedure: "review-plan", kind: "procedure" },
    ]);

    expect(
      await callSessionMcpTool(api, "cell_descendants", {
        cellRef: reviewResult.cell,
        kind: "agent",
      }),
    ).toMatchObject([
      { procedure: "callAgent", kind: "agent" },
      { procedure: "callAgent", kind: "agent" },
    ]);
  });

  test("lists and dispatches procedures through the generic MCP surface", async () => {
    const rootDir = mkdtempSync(join(process.cwd(), ".tmp-session-mcp-"));
    const commandsDir = mkdtempSync(join(process.cwd(), ".tmp-session-mcp-commands-"));
    tempDirs.push(rootDir, commandsDir);

    const registry = new ProcedureRegistry(commandsDir);
    registry.loadBuiltins();
    registry.register({
      name: "review",
      description: "store a durable review result",
      inputHint: "subject to review",
      async execute(prompt) {
        return {
          data: {
            subject: prompt,
            verdict: "mixed",
          },
          display: `reviewed: ${prompt}\n`,
          summary: `review ${prompt}`,
          memory: `Reviewed ${prompt}.`,
        };
      },
    });

    const api = createSessionMcpApi({
      sessionId: "session-mcp",
      cwd: process.cwd(),
      rootDir,
      registry,
    });

    const listed = await callSessionMcpTool(api, "procedure_list", {}) as {
      procedures: Array<{
        name: string;
        description: string;
        inputHint?: string;
      }>;
    };
    expect(listed.procedures).toContainEqual({
      name: "review",
      description: "store a durable review result",
      inputHint: "subject to review",
    });

    expect(await callSessionMcpTool(api, "procedure_get", { name: "review" })).toEqual({
      name: "review",
      description: "store a durable review result",
      inputHint: "subject to review",
    });

    const dispatchCorrelationId = crypto.randomUUID();
    const dispatched = await callSessionMcpTool(api, "procedure_dispatch", {
      name: "review",
      prompt: "patch",
      dispatchCorrelationId,
    }) as {
      procedure: string;
      cell: { sessionId: string; cellId: string };
      summary?: string;
      display?: string;
      memory?: string;
      dataRef?: { cell: { sessionId: string; cellId: string }; path: string };
      dataShape?: { subject: string; verdict: string };
    };

    expect(dispatched).toMatchObject({
      procedure: "review",
      summary: "review patch",
      display: "reviewed: patch\n",
      memory: "Reviewed patch.",
      dataShape: {
        subject: "patch",
        verdict: "mixed",
      },
    });

    expect(dispatched.dataRef).toBeDefined();
    expect(api.topLevelRuns({ procedure: "review" })).toMatchObject([
      {
        cell: dispatched.cell,
        procedure: "review",
        summary: "review patch",
      },
    ]);
    expect(api.cellGet(dispatched.cell).meta.dispatchCorrelationId).toBe(dispatchCorrelationId);
    expect(dispatched.dataRef ? api.refRead(dispatched.dataRef) : undefined).toEqual({
      subject: "patch",
      verdict: "mixed",
    });
  });
});
