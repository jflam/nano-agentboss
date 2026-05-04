import { expect, test } from "bun:test";
import * as appRuntime from "@nanoboss/app-runtime";

test("public entrypoint exports a smoke symbol", () => {
  expect(appRuntime.NanobossService).toBeDefined();
  expect("shouldLoadDiskCommands" in appRuntime).toBe(false);
  expect("summarizeToolCallStart" in appRuntime).toBe(false);
  expect("summarizeToolCallUpdate" in appRuntime).toBe(false);
});

test("public entrypoint does not leak procedure-engine implementation classes", () => {
  expect("UiApiImpl" in appRuntime).toBe(false);
});
