import { describe, expect, test } from "bun:test";

import { NanobossTuiApp } from "../../src/tui/app.ts";
import { createInitialUiState, type UiState } from "../../src/tui/state.ts";

class FakeEditor {
  text = "";
  disableSubmit = false;
  onSubmit?: (text: string) => void;
  onChange?: (text: string) => void;
  history: string[] = [];
  autocompleteProvider?: unknown;

  addToHistory(text: string): void {
    this.history.push(text);
  }

  setText(text: string): void {
    this.text = text;
    this.onChange?.(text);
  }

  getText(): string {
    return this.text;
  }

  setAutocompleteProvider(provider: unknown): void {
    this.autocompleteProvider = provider;
  }

  submit(): void {
    if (!this.disableSubmit) {
      this.onSubmit?.(this.text);
    }
  }
}

describe("NanobossTuiApp", () => {
  test("keeps pi-tui submit enabled for /quit while a run is active", () => {
    const editor = new FakeEditor();
    const handledSubmissions: string[] = [];
    let currentState: UiState = createInitialUiState({
      cwd: "/repo",
      showToolCalls: true,
    });
    let capturedOnStateChange: ((state: UiState) => void) | undefined;

    new NanobossTuiApp(
      {
        serverUrl: "http://localhost:3000",
        showToolCalls: true,
      },
      {
        createTerminal: () => ({
          setTitle() {},
          async drainInput() {},
        }),
        createTui: () => ({
          addInputListener() {},
          addChild() {},
          setFocus() {},
          start() {},
          requestRender() {},
          stop() {},
        }),
        createEditor: () => editor,
        createController: (_params, deps) => {
          capturedOnStateChange = deps.onStateChange;
          return {
            getState: () => currentState,
            async handleSubmit(text: string) {
              handledSubmissions.push(text);
            },
            requestExit() {},
            async run() {
              return undefined;
            },
            async stop() {},
          };
        },
        createView: () => ({
          setState() {},
        }),
      },
    );

    editor.setText("hello");
    currentState = {
      ...currentState,
      inputDisabled: true,
    };
    capturedOnStateChange?.(currentState);
    expect(editor.disableSubmit).toBe(true);

    editor.setText("/quit");
    expect(editor.disableSubmit).toBe(false);

    editor.submit();
    expect(handledSubmissions).toEqual(["/quit"]);
  });
});
