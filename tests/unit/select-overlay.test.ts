import { describe, expect, test } from "bun:test";

import { createNanobossTuiTheme } from "../../src/tui/theme.ts";
import { SelectOverlay } from "../../src/tui/overlays/select-overlay.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("SelectOverlay", () => {
  test("renders and updates a selected-item detail section below the list", () => {
    let renderRequests = 0;
    const overlay = new SelectOverlay(
      {
        requestRender() {
          renderRequests += 1;
        },
      } as never,
      createNanobossTuiTheme(),
      {
        title: "Resume nanoboss session",
        items: [
          {
            value: "session-1",
            label: "session 1",
            description: "repo one",
          },
          {
            value: "session-2",
            label: "session 2",
            description: "repo two",
          },
        ],
        selectedDetailTitle: "First user prompt",
        renderSelectedDetail: (item) => item.value === "session-1"
          ? "first prompt for session one"
          : "first prompt for session two",
      },
      () => {},
    );

    const initial = stripAnsi(overlay.render(80).join("\n"));
    expect(initial).toContain("First user prompt");
    expect(initial).toContain("first prompt for session one");

    overlay.handleInput("\u001b[B");

    const updated = stripAnsi(overlay.render(80).join("\n"));
    expect(updated).toContain("first prompt for session two");
    expect(renderRequests).toBeGreaterThan(0);
  });
});
