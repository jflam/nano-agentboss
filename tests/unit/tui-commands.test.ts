import { describe, expect, test } from "bun:test";

import { shouldDisableEditorSubmit } from "../../src/tui/commands.ts";

describe("tui commands", () => {
  test("keeps submit enabled for exit commands while a run is active", () => {
    expect(shouldDisableEditorSubmit(true, "/quit")).toBe(false);
    expect(shouldDisableEditorSubmit(true, "/exit")).toBe(false);
    expect(shouldDisableEditorSubmit(true, "/end")).toBe(false);
    expect(shouldDisableEditorSubmit(true, "quit")).toBe(false);
  });

  test("disables submit for non-exit input while a run is active", () => {
    expect(shouldDisableEditorSubmit(true, "hello")).toBe(true);
    expect(shouldDisableEditorSubmit(true, "/new")).toBe(true);
  });

  test("leaves submit enabled when no run is active", () => {
    expect(shouldDisableEditorSubmit(false, "hello")).toBe(false);
    expect(shouldDisableEditorSubmit(false, "/quit")).toBe(false);
  });
});
