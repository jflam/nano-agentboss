import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getWorkspaceIdentity } from "@nanoboss/app-support";
import { describeWorkspaceMismatch, matchesServerBuild, startPrivateHttpServer } from "@nanoboss/adapters-http";

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

  test("rejects workspace mismatches for explicit shared servers", () => {
    expect(describeWorkspaceMismatch({
      status: "ok",
      workspaceKey: "/repo-two",
      repoRoot: "/repo-two",
      proceduresFingerprint: "def456",
    }, {
      ...getWorkspaceIdentity("/repo-one"),
      cwd: "/repo-one",
      repoRoot: "/repo-one",
      workspaceKey: "/repo-one",
      proceduresFingerprint: "abc123",
    })).toContain("/repo-two");
  });

  test("starts private servers through the shared self-command resolver", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "nab-http-self-cmd-"));
    const commandPath = join(tempDir, "nanoboss-self-command");
    const argsPath = join(tempDir, "args.log");
    writeFileSync(commandPath, [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" > \"$NANOBOSS_TEST_HTTP_ARGS_LOG\"",
      "echo 'NANOBOSS_SERVER_READY {\"baseUrl\":\"http://127.0.0.1:1\",\"mode\":\"private\"}'",
      "",
    ].join("\n"), "utf8");
    chmodSync(commandPath, 0o755);

    const originalSelfCommand = process.env.NANOBOSS_SELF_COMMAND;
    const originalArgsLog = process.env.NANOBOSS_TEST_HTTP_ARGS_LOG;
    process.env.NANOBOSS_SELF_COMMAND = commandPath;
    process.env.NANOBOSS_TEST_HTTP_ARGS_LOG = argsPath;

    try {
      const server = await startPrivateHttpServer({ cwd: tempDir });
      await server.stop();

      expect(readFileSync(argsPath, "utf8").trim().split("\n")).toEqual([
        "http",
        "--host",
        "127.0.0.1",
        "--port",
        expect.stringMatching(/^\d+$/),
        "--mode",
        "private",
        "--ready-signal",
      ]);
    } finally {
      restoreEnv("NANOBOSS_SELF_COMMAND", originalSelfCommand);
      restoreEnv("NANOBOSS_TEST_HTTP_ARGS_LOG", originalArgsLog);
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}
