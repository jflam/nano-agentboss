/**
 * @nanoboss/tui-extension-sdk
 *
 * Types-only public contract between TUI extensions and the Nanoboss TUI.
 *
 * Extensions depend on this package for authoring types; they never import
 * the module-level `register*` functions directly. All runtime registration
 * happens through the `TuiExtensionContext` passed to `activate(ctx)`.
 */

import type {
  ActivityBarSegment,
  ChromeContribution,
  ChromeSlotId,
  KeyBinding,
  NanobossTuiTheme,
  PanelRenderer,
  UiState,
} from "@nanoboss/adapters-tui";

export type {
  ActivityBarSegment,
  ChromeContribution,
  ChromeSlotId,
  KeyBinding,
  NanobossTuiTheme,
  PanelRenderer,
  UiState,
};

// TODO(tui-extensibility-primitives): Re-export `Component` from
// @nanoboss/adapters-tui once it surfaces the pi-tui re-export on its public
// barrel (tracked in the primitives plan steps 1–3). Until then we expose a
// placeholder structural alias so the SDK compiles standalone and extension
// authors can write `PanelRenderer<T>` whose `render(...)` returns a
// `Component`. Tighten this to a direct re-export once the upstream barrel
// exposes it.
export type Component = unknown;

/**
 * Which tier this extension was loaded from.
 * - "builtin": compiled into Nanoboss itself
 * - "profile": `~/.nanoboss/extensions/`
 * - "repo":    `<repo>/.nanoboss/extensions/`
 */
export type TuiExtensionScope = "builtin" | "profile" | "repo";

/**
 * Static metadata exported by a TuiExtension module. Catalog discovery reads
 * this statically (without executing `activate`) when possible, so keep the
 * declaration free of side-effectful imports.
 */
export interface TuiExtensionMetadata {
  name: string;
  version: string;
  description: string;
  /**
   * Optional capability declarations. Used by the catalog for ordering and
   * for introspection surfaces like `/extensions`. All ids should be the
   * extension-local ids (the catalog namespaces them with `<name>/<id>` at
   * registration time).
   */
  provides?: {
    bindings?: string[];
    chromeContributions?: string[];
    activityBarSegments?: string[];
    panelRenderers?: string[];
  };
}

/**
 * Logger routed through the TUI status-line pathway so extension messages
 * surface to the user without crashing the TUI.
 */
export interface TuiExtensionLogger {
  info(text: string): void;
  warning(text: string): void;
  error(text: string): void;
}

/**
 * Runtime activation context. This is the only surface an extension uses to
 * mutate TUI state. The SDK intentionally does NOT re-export the module-level
 * register* functions from @nanoboss/adapters-tui — all registration must go
 * through this context so the catalog can namespace ids per extension and
 * enforce precedence (repo > profile > builtin).
 */
export interface TuiExtensionContext {
  readonly extensionName: string;
  readonly scope: TuiExtensionScope;
  readonly theme: NanobossTuiTheme;

  registerKeyBinding(binding: KeyBinding): void;
  registerChromeContribution(contribution: ChromeContribution): void;
  registerActivityBarSegment(segment: ActivityBarSegment): void;
  registerPanelRenderer<T>(renderer: PanelRenderer<T>): void;

  readonly log: TuiExtensionLogger;
}

/**
 * Authoring contract for a TUI extension. A module placed under
 * `.nanoboss/extensions/` default-exports a value of this shape.
 */
export interface TuiExtension {
  metadata: TuiExtensionMetadata;
  activate(ctx: TuiExtensionContext): void | Promise<void>;
  deactivate?(ctx: TuiExtensionContext): void | Promise<void>;
}
