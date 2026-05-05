import type {
  DownstreamAgentSelection,
} from "@nanoboss/contracts";
import { writePersistedDefaultAgentSelection } from "@nanoboss/store";
import type { ClipboardImageProvider } from "./clipboard/provider.ts";
import {
  type ComposerState,
  createComposerState,
} from "./composer.ts";
import { createAppControllerDeps } from "./app-controller-deps.ts";
import {
  handleCtrlVImagePaste as handleCtrlVImagePasteInternal,
  handleImageTokenDeletion as handleImageTokenDeletionInternal,
} from "./app-clipboard.ts";
import { AppContinuationComposer } from "./app-continuation-composer.ts";
import { bindAppEditorHandlers } from "./app-editor-handlers.ts";
import { AppSigintExit } from "./app-sigint-exit.ts";

import {
  NanobossTuiController,
  type NanobossTuiControllerDeps,
} from "./controller.ts";
import { shouldDisableEditorSubmit } from "./commands.ts";
import { AppAutocompleteSync } from "./app-autocomplete.ts";
import { createAppBindingHooks as createAppBindingHooksInternal } from "./app-binding-hooks.ts";
import { bindAppInputListener } from "./app-input-listener.ts";
// Side-effect import: registers the core keybindings into the module-level
// registry so dispatchKeyBinding() resolves them without the caller having
// to wire individual handlers.
import "./core-bindings.ts";
// Side-effect import: registers the core form renderers into the
// module-level FormRenderer registry so getFormRenderer(...) resolves
// nb/simplify2-checkpoint@1 and nb/simplify2-focus-picker@1 without
// the caller having to wire individual handlers.
import "./core-form-renderers.ts";
import { AppInlineSelect } from "./app-inline-select.ts";
import type { SelectOverlayOptions } from "./overlays/select-overlay.ts";
import type { UiState } from "./state.ts";
import type { NanobossTuiTheme } from "./theme.ts";
import { AppLiveUpdates } from "./app-live-updates.ts";
import {
  createAppCoreComponents,
  createAppView,
} from "./app-components.ts";
import {
  runAppLifecycle,
  stopAppLifecycle,
} from "./app-lifecycle.ts";
import { AppModelPrompts } from "./app-model-prompts.ts";
export type { NanobossTuiAppParams } from "./app-types.ts";
import type {
  ControllerLike,
  EditorLike,
  NanobossTuiAppDeps,
  NanobossTuiAppParams,
  TerminalLike,
  TuiLike,
  ViewLike,
} from "./app-types.ts";

const TOOL_OUTPUT_TOGGLE_COOLDOWN_MS = 150;
const CTRL_C_EXIT_WINDOW_MS = 500;

export class NanobossTuiApp {
  private readonly cwd: string;
  private readonly theme: NanobossTuiTheme;
  private readonly terminal: TerminalLike;
  private readonly tui: TuiLike;
  private readonly editor: EditorLike;
  private readonly view: ViewLike;
  private readonly controller: ControllerLike;
  private readonly clipboardImageProvider: ClipboardImageProvider;
  private readonly liveUpdates: AppLiveUpdates;
  private readonly continuationComposer: AppContinuationComposer;
  private readonly autocomplete: AppAutocompleteSync;
  private readonly sigintExit: AppSigintExit;
  private readonly inlineSelect: AppInlineSelect;
  private readonly modelPrompts: AppModelPrompts;
  private readonly now: () => number;
  private state: UiState;
  private readonly composerState = createComposerState();
  private clearedComposerStateSnapshot?: ComposerState;
  private stopped = false;
  private lastToolOutputToggleAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly params: NanobossTuiAppParams,
    private readonly deps: NanobossTuiAppDeps = {},
  ) {
    this.cwd = params.cwd ?? process.cwd();
    this.now = deps.now ?? Date.now;

    const components = createAppCoreComponents(deps);
    this.theme = components.theme;
    this.terminal = components.terminal;
    this.tui = components.tui;
    this.editor = components.editor;
    this.clipboardImageProvider = components.clipboardImageProvider;

    const controllerDeps: NanobossTuiControllerDeps = createAppControllerDeps({
      appParams: params,
      composerState: this.composerState,
      editor: this.editor,
      promptForModelSelection: async (currentSelection) =>
        await this.promptForInlineModelSelection(currentSelection),
      confirmPersistDefaultAgentSelection: async (selection) =>
        await this.promptToPersistInlineModelSelection(selection),
      persistDefaultAgentSelection: writePersistedDefaultAgentSelection,
      onStateChange: (state) => {
        this.syncState(state);
      },
    });
    this.controller = deps.createController?.(params, controllerDeps) ?? new NanobossTuiController(params, controllerDeps);
    this.state = this.controller.getState();
    this.view = createAppView({
      deps,
      editor: this.editor,
      theme: this.theme,
      state: this.state,
    });
    this.autocomplete = new AppAutocompleteSync({
      editor: this.editor,
      cwd: this.cwd,
    });
    this.sigintExit = new AppSigintExit({
      controller: this.controller,
      editor: this.editor,
      now: this.now,
      exitWindowMs: CTRL_C_EXIT_WINDOW_MS,
    });
    this.continuationComposer = new AppContinuationComposer({
      tui: this.tui,
      view: this.view,
      editor: this.editor,
      controller: this.controller,
      theme: this.theme,
      getState: () => this.state,
      requestRender: (force) => this.requestRender(force),
    });
    this.inlineSelect = new AppInlineSelect({
      tui: this.tui,
      view: this.view,
      theme: this.theme,
      continuationComposer: this.continuationComposer,
      requestRender: (force) => this.requestRender(force),
    });
    this.liveUpdates = new AppLiveUpdates({
      tui: this.tui,
      view: this.view,
      getState: () => this.state,
      setState: (state) => {
        this.state = state;
      },
      isStopped: () => this.stopped,
      setInterval: deps.setInterval ?? globalThis.setInterval,
      clearInterval: deps.clearInterval ?? globalThis.clearInterval,
    });
    this.modelPrompts = new AppModelPrompts({
      cwd: this.cwd,
      deps: this.deps,
      controller: this.controller,
      promptWithInlineSelect: async (options) =>
        await this.promptWithInlineSelect(options),
    });

    bindAppEditorHandlers({
      editor: this.editor,
      controller: this.controller,
      composerState: this.composerState,
      getClearedComposerStateSnapshot: () => this.clearedComposerStateSnapshot,
      setClearedComposerStateSnapshot: (snapshot) => {
        this.clearedComposerStateSnapshot = snapshot;
      },
      clearClearedComposerStateSnapshot: () => {
        this.clearedComposerStateSnapshot = undefined;
      },
      updateEditorSubmitState: () => this.updateEditorSubmitState(),
    });

    bindAppInputListener({
      tui: this.tui,
      controller: this.controller,
      editor: this.editor,
      getState: () => this.state,
      createBindingAppHooks: () => this.createBindingAppHooks(),
      handleImageTokenDeletion: (direction) => this.handleImageTokenDeletion(direction),
    });

    this.tui.addChild(this.view);
    this.tui.setFocus(this.editor);
    this.syncState(this.state);
  }

  async run(): Promise<string | undefined> {
    return await runAppLifecycle({
      tui: this.tui,
      terminal: this.terminal,
      liveUpdates: this.liveUpdates,
      controller: this.controller,
      stop: async () => await this.stop(),
    });
  }

  requestExit(): void {
    this.controller.requestExit();
  }

  /**
   * Surface a one-line status message through the controller's existing
   * status-line pathway. Exposed so callers (e.g. runTuiCli) can flush
   * extension-boot diagnostics collected before the controller existed.
   */
  showStatus(text: string): void {
    this.controller.showStatus(text);
  }

  showLocalCard(opts: {
    key?: string;
    title: string;
    markdown: string;
    severity?: "info" | "warn" | "error";
    dismissible?: boolean;
  }): void {
    this.controller.showLocalCard(opts);
  }

  requestSigintExit(): boolean {
    return this.sigintExit.request();
  }

  private syncState(state: UiState): void {
    if (this.theme.getToolCardMode() !== state.toolCardThemeMode) {
      this.theme.setToolCardMode(state.toolCardThemeMode);
    }
    this.state = this.liveUpdates.withPauseState(state);
    this.updateEditorSubmitState();
    this.autocomplete.refresh(this.state);
    this.view.setState(this.state);
    this.continuationComposer.sync();
    this.requestRender();
  }

  private requestRender(force?: boolean): void {
    this.liveUpdates.requestRender(force);
  }

  private toggleLiveUpdatesPaused(): void {
    this.liveUpdates.togglePaused();
  }

  private updateEditorSubmitState(): void {
    this.editor.disableSubmit = shouldDisableEditorSubmit(
      this.state.inputDisabled,
      this.state.inputDisabledReason,
      this.editor.getText(),
    );
  }

  private async handleCtrlVImagePaste(): Promise<void> {
    await handleCtrlVImagePasteInternal({
      clipboardImageProvider: this.clipboardImageProvider,
      composerState: this.composerState,
      editor: this.editor,
      showClipboardCard: (opts) => this.controller.showLocalCard(opts),
    });
  }

  private handleImageTokenDeletion(direction: "backspace" | "delete"): boolean {
    return handleImageTokenDeletionInternal({
      direction,
      composerState: this.composerState,
      editor: this.editor,
      showClipboardCard: (opts) => this.controller.showLocalCard(opts),
    });
  }

  private async promptForInlineModelSelection(
    currentSelection?: DownstreamAgentSelection,
  ): Promise<DownstreamAgentSelection | undefined> {
    return await this.modelPrompts.promptForModelSelection(currentSelection);
  }

  private async promptToPersistInlineModelSelection(
    selection: DownstreamAgentSelection,
  ): Promise<boolean> {
    return await this.modelPrompts.confirmPersistDefaultAgentSelection(selection);
  }

  private async promptWithInlineSelect<T extends string>(
    options: SelectOverlayOptions<T>,
  ): Promise<T | undefined> {
    return await this.inlineSelect.prompt(options);
  }

  private createBindingAppHooks() {
    return createAppBindingHooksInternal({
      controller: this.controller,
      editor: this.editor,
      composerState: this.composerState,
      getClearedComposerStateSnapshot: () => this.clearedComposerStateSnapshot,
      clearClearedComposerStateSnapshot: () => {
        this.clearedComposerStateSnapshot = undefined;
      },
      handleCtrlC: () => this.sigintExit.request(),
      handleCtrlVImagePaste: async () => await this.handleCtrlVImagePaste(),
      toggleLiveUpdatesPaused: () => {
        this.toggleLiveUpdatesPaused();
      },
      now: this.now,
      getLastToolOutputToggleAt: () => this.lastToolOutputToggleAt,
      setLastToolOutputToggleAt: (value) => {
        this.lastToolOutputToggleAt = value;
      },
      toolOutputToggleCooldownMs: TOOL_OUTPUT_TOGGLE_COOLDOWN_MS,
    });
  }

  private async stop(): Promise<void> {
    await stopAppLifecycle({
      stopped: this.stopped,
      setStopped: (stopped) => {
        this.stopped = stopped;
      },
      liveUpdates: this.liveUpdates,
      controller: this.controller,
      terminal: this.terminal,
      tui: this.tui,
    });
  }
}
