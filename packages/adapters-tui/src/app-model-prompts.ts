import type {
  DownstreamAgentSelection,
} from "@nanoboss/contracts";

import type { ControllerLike, NanobossTuiAppDeps } from "./app-types.ts";
import type { SelectOverlayOptions } from "./overlays/select-overlay.ts";
import {
  promptForInlineModelSelection as promptForInlineModelSelectionInternal,
  promptToPersistInlineModelSelection as promptToPersistInlineModelSelectionInternal,
} from "./app-model-selection.ts";

export class AppModelPrompts {
  constructor(
    private readonly params: {
      cwd: string;
      deps: NanobossTuiAppDeps;
      controller: ControllerLike;
      promptWithInlineSelect: <T extends string>(
        options: SelectOverlayOptions<T>,
      ) => Promise<T | undefined>;
    },
  ) {}

  async promptForModelSelection(
    currentSelection?: DownstreamAgentSelection,
  ): Promise<DownstreamAgentSelection | undefined> {
    return await promptForInlineModelSelectionInternal({
      cwd: this.params.cwd,
      currentSelection,
      deps: this.params.deps,
      showStatus: (text) => this.params.controller.showStatus(text),
      promptWithInlineSelect: async (options) =>
        await this.promptWithInlineSelect(options),
    });
  }

  async confirmPersistDefaultAgentSelection(
    selection: DownstreamAgentSelection,
  ): Promise<boolean> {
    return await promptToPersistInlineModelSelectionInternal({
      selection,
      promptWithInlineSelect: async (options) =>
        await this.promptWithInlineSelect(options),
    });
  }

  private async promptWithInlineSelect<T extends string>(
    options: SelectOverlayOptions<T>,
  ): Promise<T | undefined> {
    return await this.params.promptWithInlineSelect(options);
  }
}
