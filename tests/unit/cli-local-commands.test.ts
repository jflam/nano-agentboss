import { expect, test } from "bun:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";

import { reservePort } from "../e2e/helpers.ts";

function spawnCli(baseUrl: string): {
  process: ChildProcessWithoutNullStreams;
  stdout: () => string;
  stderr: () => string;
} {
  const child = spawn("bun", ["run", "nanoboss.ts", "cli"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NANOBOSS_SERVER_URL: baseUrl,
      NANOBOSS_AGENT_CMD: "bun",
      NANOBOSS_AGENT_ARGS: JSON.stringify(["run", "tests/fixtures/mock-agent.ts"]),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return {
    process: child,
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

async function waitForContains(producer: () => string, text: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (producer().includes(text)) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${text} in output:\n${producer()}`);
    }
    await Bun.sleep(50);
  }
}

async function shutdownServer(baseUrl: string): Promise<void> {
  try {
    await fetch(new URL("/v1/admin/shutdown", baseUrl), { method: "POST" });
  } catch {
    // Ignore cleanup failures.
  }
}

test("/quit exits the local CLI and prints the session id", async () => {
  const baseUrl = `http://localhost:${await reservePort()}`;
  const cli = spawnCli(baseUrl);

  try {
    await waitForContains(cli.stdout, "> ");
    cli.process.stdin.write("/quit\n");

    await Promise.race([
      once(cli.process, "exit"),
      Bun.sleep(10_000).then(() => {
        throw new Error("Timed out waiting for /quit to exit the CLI");
      }),
    ]);

    expect(cli.stderr()).toContain("nanoboss session id:");
  } finally {
    if (cli.process.exitCode === null) {
      cli.process.kill();
      await once(cli.process, "exit");
    }
    await shutdownServer(baseUrl);
  }
}, 20_000);

test("/exit is accepted as an exit alias", async () => {
  const baseUrl = `http://localhost:${await reservePort()}`;
  const cli = spawnCli(baseUrl);

  try {
    await waitForContains(cli.stdout, "> ");
    cli.process.stdin.write("/exit\n");

    await Promise.race([
      once(cli.process, "exit"),
      Bun.sleep(10_000).then(() => {
        throw new Error("Timed out waiting for /exit to exit the CLI");
      }),
    ]);

    expect(cli.stderr()).toContain("nanoboss session id:");
    expect(cli.stderr()).not.toContain("Unknown command: /exit");
  } finally {
    if (cli.process.exitCode === null) {
      cli.process.kill();
      await once(cli.process, "exit");
    }
    await shutdownServer(baseUrl);
  }
}, 20_000);

test("renders markdown agent output through the terminal markdown renderer", async () => {
  const baseUrl = `http://localhost:${await reservePort()}`;
  const cli = spawnCli(baseUrl);

  try {
    await waitForContains(cli.stdout, "> ");
    cli.process.stdin.write("markdown demo\n");
    await waitForContains(cli.stdout, "const x = 1");

    await waitForContains(cli.stderr, "[tokens] 512 / 8,192 (6.3%)");

    const stdout = cli.stdout();
    expect(stdout).toContain("Demo");
    expect(stdout).toContain("- one");
    expect(stdout).toContain("const x = 1");
    expect(stdout).not.toContain("# Demo");
    expect(stdout).not.toContain("```ts");
    expect(stdout).not.toContain("```");
    expect(cli.stderr()).toContain("[tokens] 512 / 8,192 (6.3%)");
  } finally {
    if (cli.process.exitCode === null) {
      cli.process.kill();
      await once(cli.process, "exit");
    }
    await shutdownServer(baseUrl);
  }
}, 20_000);

test("renders nested tool calls with rails under their parent wrapper", async () => {
  const baseUrl = `http://localhost:${await reservePort()}`;
  const cli = spawnCli(baseUrl);

  try {
    await waitForContains(cli.stdout, "> ");
    cli.process.stdin.write("nested tool trace demo\n");
    await waitForContains(cli.stderr, "[tool] defaultSession: nested tool trace demo");
    await waitForContains(cli.stderr, "│ [tool] Mock read README.md");

    expect(cli.stderr()).toContain("[tool] defaultSession: nested tool trace demo");
    expect(cli.stderr()).toContain("│ [tool] Mock read README.md");
  } finally {
    if (cli.process.exitCode === null) {
      cli.process.kill();
      await once(cli.process, "exit");
    }
    await shutdownServer(baseUrl);
  }
}, 20_000);

test("renders stored and injected memory cards around default turns", async () => {
  const baseUrl = `http://localhost:${await reservePort()}`;
  const cli = spawnCli(baseUrl);

  try {
    await waitForContains(cli.stdout, "> ");
    cli.process.stdin.write("/tokens\n");
    await waitForContains(cli.stdout, "No live token metrics yet.");
    await waitForContains(cli.stderr, "[memory] stored /tokens @ ");

    await waitForContains(cli.stdout, "> ");
    cli.process.stdin.write("what is 2+2\n");
    await waitForContains(cli.stderr, "[memory] injecting 1 card");
    await waitForContains(cli.stderr, "│ /tokens @ ");
    await waitForContains(cli.stderr, "│   summary: tokens: unavailable");
    await waitForContains(cli.stderr, "│   memory: tokens: unavailable");
    await waitForContains(cli.stderr, "[tool] defaultSession: what is 2+2");

    expect(cli.stderr()).toContain("[memory] stored /tokens @ ");
    expect(cli.stderr()).toContain("[memory] injecting 1 card");
    expect(cli.stderr()).toContain("│ /tokens @ ");
    expect(cli.stderr()).toContain("│   summary: tokens: unavailable");
    expect(cli.stderr()).toContain("│   memory: tokens: unavailable");
  } finally {
    if (cli.process.exitCode === null) {
      cli.process.kill();
      await once(cli.process, "exit");
    }
    await shutdownServer(baseUrl);
  }
}, 20_000);
