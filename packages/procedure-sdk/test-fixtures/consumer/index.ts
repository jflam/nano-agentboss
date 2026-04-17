import {
  createTextPromptInput,
  expectData,
  expectDataRef,
  jsonType,
  normalizePromptInput,
  promptInputAttachmentSummaries,
  promptInputDisplayText,
  promptInputToPlainText,
  type Procedure,
  type RunResult,
} from "@nanoboss/procedure-sdk";

interface ReleaseSummary {
  title: string;
  promptText: string;
  attachmentCount: number;
}

const ReleaseSummaryType = jsonType<ReleaseSummary>(
  {
    type: "object",
    properties: {
      title: { type: "string" },
      promptText: { type: "string" },
      attachmentCount: { type: "number" },
    },
    required: ["title", "promptText", "attachmentCount"],
  },
  (input): input is ReleaseSummary =>
    typeof input === "object" &&
    input !== null &&
    "title" in input &&
    typeof input.title === "string" &&
    "promptText" in input &&
    typeof input.promptText === "string" &&
    "attachmentCount" in input &&
    typeof input.attachmentCount === "number",
);

const seededPrompt = normalizePromptInput({
  parts: [
    ...createTextPromptInput("Summarize the release notes for ").parts,
    {
      type: "image",
      token: "[Image 1: PNG 1200x800 28KB]",
      mimeType: "image/png",
      data: "ZmFrZS1pbWFnZQ==",
      width: 1200,
      height: 800,
      byteLength: 28_000,
    },
    {
      type: "text",
      text: " before publishing.",
    },
  ],
});

const releaseSummaryProcedure: Procedure = {
  name: "release-summary",
  description: "Summarize release notes into a typed payload.",
  inputHint: "Provide screenshots when the release changes UI behavior.",
  async execute(prompt, ctx) {
    const promptInput = normalizePromptInput(
      ctx.promptInput ? { parts: ctx.promptInput.parts } : seededPrompt,
    );
    const displayText = promptInputDisplayText(promptInput);
    const plainText = promptInputToPlainText(promptInput);
    const attachments = promptInputAttachmentSummaries(promptInput);
    const agentResult = await ctx.agent.run(displayText, ReleaseSummaryType, {
      promptInput,
    });
    const data = expectData(agentResult);
    const dataRef = expectDataRef(agentResult);

    return {
      data: {
        ...data,
        title: data.title || prompt,
        promptText: plainText,
        attachmentCount: attachments.length,
      },
      display: dataRef.path,
      explicitDataSchema: ReleaseSummaryType.schema,
      summary: displayText,
    };
  },
};

const consumerResult = {
  run: {
    sessionId: "session-release",
    runId: "run-release",
  },
  data: {
    title: "April release",
    promptText: promptInputToPlainText(seededPrompt),
    attachmentCount: promptInputAttachmentSummaries(seededPrompt).length,
  },
  dataRef: {
    run: {
      sessionId: "session-release",
      runId: "run-release",
    },
    path: "output.data",
  },
} satisfies RunResult<ReleaseSummary>;

const releaseSummary = expectData(consumerResult);
const releaseSummaryRef = expectDataRef(consumerResult);
const releaseSummaryIsValid = ReleaseSummaryType.validate(releaseSummary);

function assertType<T>(_value: T): void {}

assertType<Procedure>(releaseSummaryProcedure);
assertType<ReleaseSummary>(releaseSummary);
assertType<string>(releaseSummaryRef.path);
assertType<boolean>(releaseSummaryIsValid);
