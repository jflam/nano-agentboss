import {
  getProviderLabel,
  listKnownProviders,
  listSelectableModelOptions,
} from "../../model-catalog.ts";
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
