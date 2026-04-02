import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "bun:test";

import {
  getCurrentSessionPointerPath,
  readCurrentSessionPointer,
  writeCurrentSessionPointer,
} from "../../src/current-session.ts";

let tempHome: string | undefined;

afterEach(() => {
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
    tempHome = undefined;
  }
});

test("writes and reads the current session pointer", () => {
  const originalHome = process.env.HOME;
  tempHome = mkdtempSync(join(tmpdir(), "nanoboss-current-session-"));
  process.env.HOME = tempHome;

  try {
    writeCurrentSessionPointer({
      sessionId: "session-123",
      cwd: "/repo",
      rootDir: "/repo/.nanoboss/session-123",
    });

    expect(readCurrentSessionPointer()).toMatchObject({
      sessionId: "session-123",
      cwd: "/repo",
      rootDir: "/repo/.nanoboss/session-123",
    });
    expect(readFileSync(getCurrentSessionPointerPath(), "utf8")).toContain("\"sessionId\": \"session-123\"");
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});
