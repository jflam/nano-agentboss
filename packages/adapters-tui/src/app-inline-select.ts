import type {
  TuiLike,
  ViewLike,
} from "./app-types.ts";
import type { AppContinuationComposer } from "./app-continuation-composer.ts";
import {
  TUI,
} from "./pi-tui.ts";
import { SelectOverlay, type SelectOverlayOptions } from "./overlays/select-overlay.ts";
import type { NanobossTuiTheme } from "./theme.ts";

export class AppInlineSelect {
  constructor(
    private readonly deps: {
      tui: TuiLike;
      view: ViewLike;
      theme: NanobossTuiTheme;
      continuationComposer: AppContinuationComposer;
      requestRender: (force?: boolean) => void;
    },
  ) {}

  async prompt<T extends string>(
    options: SelectOverlayOptions<T>,
  ): Promise<T | undefined> {
    return await new Promise<T | undefined>((resolve) => {
      this.deps.continuationComposer.beginSelect();
      const component = new SelectOverlay<T>(
        this.deps.tui as TUI,
        this.deps.theme,
        options,
        (value) => {
          this.deps.continuationComposer.restoreEditorComposer();
          resolve(value);
        },
      );
      this.deps.view.showComposer(component);
      this.deps.tui.setFocus(component);
      this.deps.requestRender(true);
    });
  }
}
