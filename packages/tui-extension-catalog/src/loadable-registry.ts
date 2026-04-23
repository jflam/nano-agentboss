import type {
  TuiExtension,
  TuiExtensionMetadata,
  TuiExtensionScope,
} from "@nanoboss/tui-extension-sdk";

/**
 * Minimal registry surface consumed by callers that seed already-constructed
 * builtin extensions before activation.
 */
export interface LoadableTuiExtensionRegistry {
  registerBuiltinExtension(extension: TuiExtension): void;
}

/**
 * Record tracked by the registry for each discovered extension.
 */
export interface RegisteredTuiExtension {
  metadata: TuiExtensionMetadata;
  scope: TuiExtensionScope;
  /** Absolute path of the entry file on disk; undefined for builtins. */
  entryPath?: string;
  /** Load the module's default export lazily when activation runs. */
  load: () => Promise<TuiExtension>;
}

/**
 * Activation status reported by `listMetadata()` after `activateAll()` runs.
 * `pending` means `activateAll()` has not been called yet (or the extension
 * has not been reached). `active` means activate completed without throwing.
 * `failed` means activate threw; the registry has isolated the failure and
 * the error is recorded for diagnostics.
 */
export type TuiExtensionActivationStatus = "pending" | "active" | "failed";

/**
 * Count of contributions an extension registered via its
 * `TuiExtensionContext` during activate(). Populated by the adapters-tui
 * context factory (which owns the counting) and fed back to the registry
 * via `setContributions` so the `/extensions` slash command can report
 * them.
 */
export interface TuiExtensionContributionCounts {
  bindings: number;
  chromeContributions: number;
  activityBarSegments: number;
  panelRenderers: number;
}

export interface TuiExtensionStatus {
  metadata: TuiExtensionMetadata;
  scope: TuiExtensionScope;
  status: TuiExtensionActivationStatus;
  error?: Error;
  /**
   * Per-extension contribution counts captured during activate(). Undefined
   * when the registry has not been told (e.g. pending extensions, or when
   * the adapters-tui boot path is bypassed in a test).
   */
  contributions?: TuiExtensionContributionCounts;
}

export function assertTuiExtension(value: unknown): asserts value is TuiExtension {
  if (
    !value
    || typeof value !== "object"
    || typeof (value as TuiExtension).activate !== "function"
    || !(value as TuiExtension).metadata
    || typeof (value as TuiExtension).metadata !== "object"
    || typeof (value as TuiExtension).metadata.name !== "string"
  ) {
    throw new Error("TUI extension module does not export a valid default TuiExtension");
  }
}
