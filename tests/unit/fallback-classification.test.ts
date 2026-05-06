import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CLASSIFIED_FALLBACKS = [
  {
    sourcePath: "packages/adapters-tui/src/views/views-procedure-panels.ts",
    sourceMarker: "Classification: persisted-data compatibility.",
    testPath: "packages/adapters-tui/tests/tui-views.test.ts",
    testMarker: "replays persisted procedure panel text when its renderer is unavailable",
  },
  {
    sourcePath: "packages/store/src/session-repository.ts",
    sourceMarker: "Classification: persisted-data compatibility.",
    testPath: "packages/store/tests/stored-sessions.test.ts",
    testMarker: "lists legacy session.json that stored sessionId at the top level",
  },
  {
    sourcePath: "packages/agent-acp/src/catalog-discovery.ts",
    sourceMarker: "Classification: user-facing resilience.",
    testPath: "packages/agent-acp/tests/model-catalog.test.ts",
    testMarker: "failed force refresh restores the prior cached catalog for the same provider key",
  },
  {
    sourcePath: "packages/app-runtime/src/runtime-service.ts",
    sourceMarker: "Classification: tool-server convenience.",
    testPath: "packages/adapters-mcp/tests/mcp-stdio.test.ts",
    testMarker: "serves tools/list and defaults to the current session for the server cwd",
  },
] as const;

test("keeps intentional fallback paths classified and covered", () => {
  for (const fallback of CLASSIFIED_FALLBACKS) {
    const source = readRepoFile(fallback.sourcePath);
    const tests = readRepoFile(fallback.testPath);

    expect(source, fallback.sourcePath).toContain(fallback.sourceMarker);
    expect(tests, fallback.testPath).toContain(fallback.testMarker);
  }
});

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}
