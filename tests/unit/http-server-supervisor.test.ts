import { describe, expect, test } from "bun:test";

import { matchesServerBuild } from "../../src/http/server-supervisor.ts";

describe("http server supervisor", () => {
  test("treats dirty and clean builds as different", () => {
    expect(matchesServerBuild({
      status: "ok",
      buildCommit: "516daef",
    }, "516daef-dirty")).toBe(false);
  });

  test("accepts an exact build commit match", () => {
    expect(matchesServerBuild({
      status: "ok",
      buildCommit: "516daef-dirty",
    }, "516daef-dirty")).toBe(true);
  });
});
