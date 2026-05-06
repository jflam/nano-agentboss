import { describe, expect, test } from "bun:test";

import { parseProcedureDispatchWorkerArgs } from "../src/dispatch/worker-args.ts";

describe("parseProcedureDispatchWorkerArgs", () => {
  test("parses detached worker args", () => {
    expect(parseProcedureDispatchWorkerArgs([
      "--session-id",
      "session-1",
      "--cwd",
      "/work",
      "--root-dir",
      "/repo",
      "--dispatch-id",
      "dispatch-1",
    ])).toEqual({
      sessionId: "session-1",
      cwd: "/work",
      rootDir: "/repo",
      dispatchId: "dispatch-1",
    });
  });

  test("preserves missing worker flag value errors", () => {
    expect(() => parseProcedureDispatchWorkerArgs([
      "--session-id",
      "session-1",
      "--cwd",
    ])).toThrow("Missing value for --cwd");
  });

  test("preserves missing required worker arg errors", () => {
    expect(() => parseProcedureDispatchWorkerArgs([
      "--session-id",
      "session-1",
      "--cwd",
      "/work",
      "--dispatch-id",
      "dispatch-1",
    ])).toThrow("Missing required arg: --root-dir");
  });
});
