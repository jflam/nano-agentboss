import {
  getProviderLabel,
  listKnownProviders,
  listSelectableModelOptions,
} from "./model-catalog.ts";
import type { DownstreamAgentProvider } from "./types.ts";

interface Questioner {
  question(query: string): Promise<string>;
}

interface Choice<T extends string> {
  value: T;
  label: string;
}

export interface ModelPickerSelection {
  provider: DownstreamAgentProvider;
  model: string;
}

export async function promptForModelCommand(
  questioner: Questioner,
  currentBanner: string,
  write: (text: string) => void = (text) => process.stdout.write(text),
): Promise<ModelPickerSelection | undefined> {
  write(`\nCurrent: ${currentBanner}\n`);

  const provider = await promptForChoice(
    questioner,
    write,
    "Choose an agent:",
    listKnownProviders().map((value) => ({
      value,
      label: getProviderLabel(value),
    })),
  );
  if (!provider) {
    return undefined;
  }

  const model = await promptForChoice(
    questioner,
    write,
    `Choose a ${getProviderLabel(provider)} model:`,
    listSelectableModelOptions(provider).map((option) => ({
      value: option.value,
      label: option.value,
    })),
  );
  if (!model) {
    return undefined;
  }

  return { provider, model };
}

async function promptForChoice<T extends string>(
  questioner: Questioner,
  write: (text: string) => void,
  title: string,
  choices: Choice<T>[],
): Promise<T | undefined> {
  write(`${title}\n`);
  write("  0. Cancel\n");

  choices.forEach((choice, index) => {
    write(`  ${String(index + 1)}. ${choice.label}\n`);
  });

  for (;;) {
    const raw = (await questioner.question("Select a number: ")).trim();
    if (!raw || raw === "0") {
      return undefined;
    }

    const selectedIndex = Number(raw);
    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= choices.length) {
      return choices[selectedIndex - 1]?.value;
    }

    write(`Invalid selection: ${raw}\n`);
  }
}

export function isInteractiveModelPickerEnabled(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY;
}

export function buildModelCommand(
  provider: DownstreamAgentProvider,
  model: string,
): string {
  return `/model ${provider} ${model}`;
}
