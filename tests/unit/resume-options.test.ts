import { describe, expect, test } from "bun:test";

import { parseResumeOptions } from "../../src/options/resume.ts";

describe("parseResumeOptions", () => {
  test("resumes the most recent session by default", () => {
    expect(parseResumeOptions([])).toEqual({
      showToolCalls: true,
      showHelp: false,
      connectionMode: "private",
      serverUrl: undefined,
      list: false,
      sessionId: undefined,
    });
  });

  test("supports explicit session ids", () => {
    expect(parseResumeOptions(["session-123"])).toEqual({
      showToolCalls: true,
      showHelp: false,
      connectionMode: "private",
      serverUrl: undefined,
      list: false,
      sessionId: "session-123",
    });
  });

  test("supports interactive listing and server overrides", () => {
    expect(parseResumeOptions(["--list", "--server-url=http://localhost:4000", "--no-tool-calls"])).toEqual({
      showToolCalls: false,
      showHelp: false,
      connectionMode: "external",
      serverUrl: "http://localhost:4000",
      list: true,
      sessionId: undefined,
    });
  });
});
