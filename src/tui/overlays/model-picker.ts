import {
  getProviderLabel,
  listKnownProviders,
  listSelectableModelOptions,
} from "../../model-catalog.ts";
import { resolveDownstreamAgentConfig } from "../../config.ts";
import { getNanobossSettingsPath } from "../../settings.ts";
import { formatAgentBanner } from "../../runtime-banner.ts";
import type { DownstreamAgentSelection, DownstreamAgentProvider } from "../../types.ts";

import { type TUI } from "../pi-tui.ts";
import type { NanobossTuiTheme } from "../theme.ts";
import { showSelectOverlay } from "./select-overlay.ts";

export async function promptForModelSelection(
  tui: TUI,
  theme: NanobossTuiTheme,
  currentSelection?: DownstreamAgentSelection,
): Promise<DownstreamAgentSelection | undefined> {
  const provider = await showSelectOverlay<DownstreamAgentProvider>(tui, theme, {
    title: "Choose an agent",
    items: listKnownProviders().map((value) => ({
      value,
      label: getProviderLabel(value),
    })),
    initialValue: currentSelection?.provider,
    footer: "↑↓ navigate • enter select • esc cancel",
  });

  if (!provider) {
    return undefined;
  }

  const model = await showSelectOverlay<string>(tui, theme, {
    title: `Choose a ${getProviderLabel(provider)} model`,
    items: listSelectableModelOptions(provider).map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description,
    })),
    initialValue: currentSelection?.provider === provider ? currentSelection.model : undefined,
    footer: "↑↓ navigate • enter select • esc cancel",
  });

  if (!model) {
    return undefined;
  }

  return {
    provider,
    model,
  };
}

export async function promptToPersistModelSelection(
  tui: TUI,
  theme: NanobossTuiTheme,
  selection: DownstreamAgentSelection,
): Promise<boolean> {
  const banner = formatAgentBanner(resolveDownstreamAgentConfig(undefined, selection));
  const decision = await showSelectOverlay<"no" | "yes">(tui, theme, {
    title: `Make ${banner} the default for future runs?`,
    items: [
      {
        value: "no",
        label: "No",
        description: "Keep this model change in the current session only",
      },
      {
        value: "yes",
        label: "Yes",
        description: `Persist under ${getNanobossSettingsPath()}`,
      },
    ],
    initialValue: "no",
    footer: "↑↓ choose • enter confirm • esc keep No",
    maxVisible: 4,
  });

  return decision === "yes";
}
