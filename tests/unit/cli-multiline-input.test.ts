import { EventEmitter } from "node:events";

import { describe, expect, test } from "bun:test";

import { readPromptInput } from "../../cli.ts";

class FakePromptReader extends EventEmitter {
  promptCalls = 0;
  prompts: string[] = [];

  async question(query: string): Promise<string> {
    this.prompts.push(query);
    return "single line";
  }

  prompt(): void {
    this.promptCalls += 1;
  }

  setPrompt(prompt: string): void {
    this.prompts.push(prompt);
  }
}

describe("CLI multiline input", () => {
  test("falls back to readline.question when terminal multiline paste handling is disabled", async () => {
    const reader = new FakePromptReader();

    const line = await readPromptInput(reader, {
      prompt: "> ",
      useTerminalMultilinePaste: false,
    });

    expect(line).toBe("single line");
    expect(reader.prompts).toEqual(["> "]);
    expect(reader.promptCalls).toBe(0);
  });

  test("batches rapidly pasted terminal lines into one multi-line prompt", async () => {
    const reader = new FakePromptReader();
    const pending = readPromptInput(reader, {
      prompt: "> ",
      debounceMs: 5,
      useTerminalMultilinePaste: true,
    });

    reader.emit("line", "alpha");
    reader.emit("line", "beta");
    reader.emit("line", "gamma");

    await expect(pending).resolves.toBe("alpha\nbeta\ngamma");
    expect(reader.prompts).toEqual(["> "]);
    expect(reader.promptCalls).toBe(1);
  });
});
