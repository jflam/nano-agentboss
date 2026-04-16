import {
  normalizePromptInput,
  type PromptInput,
  type PromptPart,
} from "@nanoboss/procedure-sdk";

export function promptInputToPlainText(input: PromptInput): string {
  return input.parts
    .map((part) => part.type === "text" ? part.text : "")
    .join("");
}

export function prependPromptInputText(input: PromptInput, blocks: string[]): PromptInput {
  if (blocks.length === 0) {
    return normalizePromptInput(input);
  }

  const prefix = blocks.join("\n\n");
  const prefixedParts: PromptPart[] = prefix.length > 0
    ? [{ type: "text", text: `${prefix}\n\n` }]
    : [];

  return {
    parts: normalizePromptInput({
      parts: [...prefixedParts, ...input.parts],
    }).parts,
  };
}
