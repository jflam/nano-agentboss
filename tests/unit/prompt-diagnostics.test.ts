import { describe, expect, test } from "bun:test";

import { estimateDefaultPromptDiagnostics } from "../../src/prompt-diagnostics.ts";

describe("prompt diagnostics", () => {
  test("estimates visible prompt tokens for copilot default prompts", () => {
    const diagnostics = estimateDefaultPromptDiagnostics(
      {
        provider: "copilot",
        command: "copilot",
        args: ["--acp"],
        model: "gpt-5.4",
      },
      {
        prompt: "what mattered most?",
        cards: [
          {
            cell: { sessionId: "session-1", cellId: "cell-1" },
            procedure: "review",
            input: "the code",
            summary: "review summary",
            memory: "Most important issue was missing edge-case analysis.",
            createdAt: "2026-04-02T20:00:00.000Z",
          },
        ],
        includeGuidance: true,
        promptIncludesUserMessageLabel: true,
      },
    );

    expect(diagnostics?.method).toBe("tiktoken");
    expect(diagnostics?.encoding).toBe("o200k_base");
    expect(diagnostics?.totalTokens).toBeGreaterThan(0);
    expect(diagnostics?.userMessageTokens).toBeGreaterThan(0);
    expect(diagnostics?.memoryCardsTokens).toBeGreaterThan(0);
    expect(diagnostics?.guidanceTokens).toBeGreaterThan(0);
    expect(diagnostics?.cards[0]?.estimatedTokens).toBeGreaterThan(0);
  });

  test("skips local tiktoken estimates for non-openai providers", () => {
    const diagnostics = estimateDefaultPromptDiagnostics(
      {
        provider: "claude",
        command: "claude-code-acp",
        args: [],
        model: "sonnet",
      },
      {
        prompt: "hello",
        cards: [],
        includeGuidance: false,
        promptIncludesUserMessageLabel: false,
      },
    );

    expect(diagnostics).toBeUndefined();
  });
});
