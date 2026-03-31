import { jsonType, type KernelValue, type RunResult, type Procedure, type ValueRef } from "../src/types.ts";

interface CritiqueResult {
  verdict: "sound" | "mixed" | "flawed";
  summary: string;
  issues: string[];
  revisedAnswer: string;
}

const CritiqueResultType = jsonType<CritiqueResult>();

export default {
  name: "second-opinion",
  description: "Get a Claude answer, then ask Codex to critique and revise it",
  inputHint: "Question or task to review",
  async execute(prompt, ctx) {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return {
        display: "Provide a question or task for /second-opinion.\n",
        summary: "second-opinion: missing prompt",
      };
    }

    const firstPass = await ctx.callAgent(
      buildClaudePrompt(trimmed),
      {
        agent: {
          provider: "claude",
          model: "opus",
        },
        stream: false,
      },
    );
    const firstPassDataRef = requireDataRef(firstPass, "Missing first-pass data ref");
    const firstPassText = firstPass.data ?? "";

    const critique = await ctx.callAgent(
      [
        "Critique the referenced answer `answer` and return a critique object.",
        "Use the original user request below as the task being answered.",
        "",
        `Original user request:\n${trimmed}`,
      ].join("\n"),
      CritiqueResultType,
      {
        agent: {
          provider: "codex",
          model: "gpt-5.4",
        },
        stream: false,
        refs: {
          answer: firstPassDataRef,
        },
      },
    );
    const critiqueData: CritiqueResult = requireData(critique, "Missing critique data");
    const critiqueDataRef = requireDataRef(critique, "Missing critique data ref");

    return {
      data: {
        subject: trimmed,
        answer: firstPassDataRef,
        critique: critiqueDataRef,
        verdict: critiqueData.verdict,
      },
      display: renderSecondOpinion(firstPassText, critiqueData),
      summary: `second-opinion: ${trimmed} (${critiqueData.verdict})`,
    };
  },
} satisfies Procedure;

function buildClaudePrompt(prompt: string): string {
  return [
    "Answer the user's request directly.",
    "Be explicit about assumptions and uncertainty.",
    "Prefer a concise but complete answer.",
    "",
    `User request:\n${prompt}`,
  ].join("\n");
}

function renderSecondOpinion(
  firstPass: string,
  critique: CritiqueResult,
): string {
  const issueLines = critique.issues.length > 0
    ? critique.issues.map((issue) => `- ${issue}`).join("\n")
    : "- none";

  return [
    "Claude (opus)",
    firstPass.trim(),
    "",
    "Codex critique (gpt-5.4)",
    `Verdict: ${critique.verdict}`,
    critique.summary.trim(),
    "",
    "Issues",
    issueLines,
    "",
    "Revised answer",
    critique.revisedAnswer.trim(),
    "",
  ].join("\n");
}

function requireData<T extends KernelValue>(result: RunResult<T>, message: string): T {
  if (result.data === undefined) {
    throw new Error(message);
  }

  return result.data;
}

function requireDataRef<T extends KernelValue>(result: RunResult<T>, message: string): ValueRef {
  if (!result.dataRef) {
    throw new Error(message);
  }

  return result.dataRef;
}
