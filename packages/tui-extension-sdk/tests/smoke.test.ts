import { expect, test } from "bun:test";
import * as tuiExtensionSdk from "@nanoboss/tui-extension-sdk";

test("tui-extension-sdk public entrypoint loads as a types-only module", () => {
  // This package exports only types, so the runtime namespace object should
  // resolve successfully but carry no runtime bindings.
  expect(tuiExtensionSdk).toBeDefined();
  expect(typeof tuiExtensionSdk).toBe("object");
  expect(Object.keys(tuiExtensionSdk)).toHaveLength(0);
});
