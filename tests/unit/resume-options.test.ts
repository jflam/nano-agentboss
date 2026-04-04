import { describe, expect, test } from "bun:test";

import { DEFAULT_HTTP_SERVER_URL } from "../../src/core/defaults.ts";
import { parseResumeOptions } from "../../src/options/resume.ts";

describe("parseResumeOptions", () => {
  test("resumes the most recent session by default", () => {
    expect(parseResumeOptions([])).toEqual({
      showToolCalls: true,
      showHelp: false,
      serverUrl: DEFAULT_HTTP_SERVER_URL,
      list: false,
      sessionId: undefined,
    });
  });

  test("supports explicit session ids", () => {
    expect(parseResumeOptions(["session-123"])).toEqual({
      showToolCalls: true,
      showHelp: false,
      serverUrl: DEFAULT_HTTP_SERVER_URL,
      list: false,
      sessionId: "session-123",
    });
  });

  test("supports interactive listing and server overrides", () => {
    expect(parseResumeOptions(["--list", "--server-url=http://localhost:4000", "--no-tool-calls"])).toEqual({
      showToolCalls: false,
      showHelp: false,
      serverUrl: "http://localhost:4000",
      list: true,
      sessionId: undefined,
    });
  });
});
