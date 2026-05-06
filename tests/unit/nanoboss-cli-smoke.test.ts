import { describe, expect, test } from "bun:test";

import { runTuiCli } from "@nanoboss/adapters-tui";
import { runCliCommand } from "../../cli.ts";

describe("nanoboss cli adapter smoke", () => {
  test("wires the private-server URL into the TUI runtime boundary", async () => {
    const events: string[] = [];

    await runCliCommand(["--no-tool-calls", "--simplify2-auto-approve"], {
      assertInteractiveTty(commandName) {
        events.push(`tty:${commandName}`);
      },
      async runTuiCli(params) {
        events.push(`cli-mode:${params.connectionMode}`);
        events.push(`cli-server-url:${String(params.serverUrl)}`);

        await runTuiCli({
          ...params,
          cwd: "/repo-one",
        }, {
          suspendReservedControlCharacters: async () => {
            events.push("terminal:suspend");
            return async () => {
              events.push("terminal:restore");
            };
          },
          addSignalListener(signal) {
            events.push(`signal:${signal}`);
            return () => {
              events.push(`unsignal:${signal}`);
            };
          },
          startPrivateHttpServer: async ({ cwd }) => {
            events.push(`private-server:${cwd}`);
            return {
              baseUrl: "http://127.0.0.1:43123",
              async stop() {
                events.push("private-server:stop");
              },
            };
          },
          bootExtensions: () => undefined,
          createApp(appParams) {
            events.push(`runtime-url:${appParams.serverUrl}`);
            events.push(`runtime-tool-calls:${String(appParams.showToolCalls)}`);
            events.push(`runtime-auto-approve:${String(appParams.simplify2AutoApprove)}`);
            return {
              async run() {
                events.push("runtime-run");
                return undefined;
              },
            };
          },
          writeStderr(text) {
            events.push(`stderr:${text}`);
          },
          setExitCode(code) {
            events.push(`exit:${code}`);
          },
        });
      },
    });

    expect(events).toEqual([
      "tty:cli",
      "cli-mode:private",
      "cli-server-url:undefined",
      "terminal:suspend",
      "signal:SIGINT",
      "signal:SIGTERM",
      "private-server:/repo-one",
      "runtime-url:http://127.0.0.1:43123",
      "runtime-tool-calls:false",
      "runtime-auto-approve:true",
      "runtime-run",
      "unsignal:SIGTERM",
      "unsignal:SIGINT",
      "terminal:restore",
      "private-server:stop",
    ]);
  });
});
