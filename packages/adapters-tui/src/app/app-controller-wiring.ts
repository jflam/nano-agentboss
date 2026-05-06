import type { DownstreamAgentSelection } from "@nanoboss/contracts";
import { writePersistedDefaultAgentSelection } from "@nanoboss/store";

import {
  NanobossTuiController,
  type NanobossTuiControllerDeps,
} from "../controller/controller.ts";
import { clearComposerState, type ComposerState } from "./composer.ts";
import type {
  ControllerLike,
  EditorLike,
  NanobossTuiAppDeps,
  NanobossTuiAppParams,
} from "./app-types.ts";
import type { UiState } from "../state/state.ts";

interface AppControllerWiringOptions {
  appParams: NanobossTuiAppParams;
  appDeps: NanobossTuiAppDeps;
  composerState: ComposerState;
  editor: Pick<EditorLike, "addToHistory" | "setText">;
  promptForModelSelection: (
    currentSelection?: DownstreamAgentSelection,
  ) => Promise<DownstreamAgentSelection | undefined>;
  confirmPersistDefaultAgentSelection: (selection: DownstreamAgentSelection) => Promise<boolean>;
  onStateChange: (state: UiState) => void;
}

export function createAppController(options: AppControllerWiringOptions): ControllerLike {
  const controllerDeps: NanobossTuiControllerDeps = {
    promptForModelSelection: options.promptForModelSelection,
    confirmPersistDefaultAgentSelection: options.confirmPersistDefaultAgentSelection,
    persistDefaultAgentSelection: writePersistedDefaultAgentSelection,
    listExtensionEntries: options.appParams.listExtensionEntries,
    onStateChange: options.onStateChange,
    onAddHistory: (text) => {
      options.editor.addToHistory(text);
    },
    onClearInput: () => {
      clearComposerState(options.composerState);
      options.editor.setText("");
    },
  };

  return options.appDeps.createController?.(options.appParams, controllerDeps)
    ?? new NanobossTuiController(options.appParams, controllerDeps);
}
