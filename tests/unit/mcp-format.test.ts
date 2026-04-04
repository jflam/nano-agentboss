import { describe, expect, test } from "bun:test";

import { formatMcpToolResult } from "../../src/mcp/server.ts";

describe("nanoboss MCP formatting", () => {
  test("wraps array results in an items record for structuredContent", () => {
    const formatted = formatMcpToolResult("top_level_runs", [
      { procedure: "review", summary: "done" },
    ]);

    expect(formatted.structuredContent).toEqual({
      items: [
        { procedure: "review", summary: "done" },
      ],
    });
  });

  test("preserves object results as structuredContent records", () => {
    const formatted = formatMcpToolResult("procedure_dispatch_start", {
      dispatchId: "dispatch_123",
      status: "queued",
    });

    expect(formatted.structuredContent).toEqual({
      dispatchId: "dispatch_123",
      status: "queued",
    });
  });
});
