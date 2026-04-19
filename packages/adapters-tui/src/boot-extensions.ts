import {
  TuiExtensionRegistry,
  type TuiExtensionContextFactory,
} from "@nanoboss/tui-extension-catalog";
import type {
  TuiExtensionContext,
  TuiExtensionLogger,
} from "@nanoboss/tui-extension-sdk";

import {
  registerActivityBarSegment as defaultRegisterActivityBarSegment,
  type ActivityBarSegment,
} from "./activity-bar.ts";
import {
  registerKeyBinding as defaultRegisterKeyBinding,
  type KeyBinding,
} from "./bindings.ts";
import {
  registerChromeContribution as defaultRegisterChromeContribution,
  type ChromeContribution,
} from "./chrome.ts";
import {
  registerPanelRenderer as defaultRegisterPanelRenderer,
  type PanelRenderer,
} from "./panel-renderers.ts";
import { createNanobossTuiTheme, type NanobossTuiTheme } from "./theme.ts";

export type TuiExtensionBootLogLevel = "info" | "warning" | "error";

/**
 * Log router handed to `bootExtensions`. In production the caller forwards
 * these lines to the TUI status-line pathway (`controller.showStatus`). In
 * tests a collector is typically passed so assertions can inspect messages.
 */
export type TuiExtensionBootLog = (
  level: TuiExtensionBootLogLevel,
  text: string,
) => void;

/**
 * Optional dependency overrides for the context factory; surfaced for tests
 * that want to verify namespacing without mutating the real module-level
 * registries.
 */
export interface TuiExtensionContextFactoryDeps {
  registerKeyBinding?: (binding: KeyBinding) => void;
  registerChromeContribution?: (contribution: ChromeContribution) => void;
  registerActivityBarSegment?: (segment: ActivityBarSegment) => void;
  registerPanelRenderer?: <T>(renderer: PanelRenderer<T>) => void;
}

/**
 * Build a `TuiExtensionContextFactory` that namespaces every contribution id
 * as `${extensionName}/${id}` before delegating to the real adapters-tui
 * registries. The returned factory is what `TuiExtensionRegistry.activateAll`
 * consumes.
 */
export function createTuiExtensionContextFactory(
  theme: NanobossTuiTheme,
  log: TuiExtensionBootLog,
  deps: TuiExtensionContextFactoryDeps = {},
): TuiExtensionContextFactory {
  const registerBinding = deps.registerKeyBinding ?? defaultRegisterKeyBinding;
  const registerChrome = deps.registerChromeContribution ?? defaultRegisterChromeContribution;
  const registerSegment = deps.registerActivityBarSegment ?? defaultRegisterActivityBarSegment;
  const registerRenderer = deps.registerPanelRenderer ?? defaultRegisterPanelRenderer;

  return ({ metadata, scope }) => {
    const extensionName = metadata.name;
    const namespace = (id: string) => `${extensionName}/${id}`;

    const logger: TuiExtensionLogger = {
      info: (text) => { log("info", `[${extensionName}] ${text}`); },
      warning: (text) => { log("warning", `[${extensionName}] ${text}`); },
      error: (text) => { log("error", `[${extensionName}] ${text}`); },
    };

    const context: TuiExtensionContext = {
      extensionName,
      scope,
      theme,
      log: logger,
      registerKeyBinding(binding) {
        registerBinding({ ...binding, id: namespace(binding.id) });
      },
      registerChromeContribution(contribution) {
        registerChrome({ ...contribution, id: namespace(contribution.id) });
      },
      registerActivityBarSegment(segment) {
        registerSegment({ ...segment, id: namespace(segment.id) });
      },
      registerPanelRenderer(renderer) {
        registerRenderer({
          ...renderer,
          rendererId: namespace(renderer.rendererId),
        });
      },
    };
    return context;
  };
}

export interface BootExtensionsOptions {
  /** Theme exposed on `ctx.theme`; defaults to a fresh nanoboss theme. */
  theme?: NanobossTuiTheme;
  /** Override of the profile extension root (useful for tests). */
  profileExtensionRoot?: string;
  /** Explicit disk roots (useful for tests / hermetic runs). */
  extensionRoots?: string[];
  /** Log router; defaults to stderr so failures are at least visible. */
  log?: TuiExtensionBootLog;
  /**
   * Pre-built registry. When supplied, `bootExtensions` will NOT call
   * `loadFromDisk()` again — the caller is responsible for seeding it.
   * Exposed primarily for tests that register builtin extensions directly.
   */
  registry?: TuiExtensionRegistry;
  /** Skip calling `loadFromDisk()`. Useful for hermetic tests. */
  skipDisk?: boolean;
  /** Skip calling `loadBuiltins()`. Useful for hermetic tests. */
  skipBuiltins?: boolean;
  /** Override for the per-extension context factory (tests only). */
  contextFactory?: TuiExtensionContextFactory;
  /** Dependency overrides forwarded to the default context factory. */
  contextFactoryDeps?: TuiExtensionContextFactoryDeps;
}

export interface BootExtensionsResult {
  registry: TuiExtensionRegistry;
  failedCount: number;
  /** One-line aggregate status, set only when `failedCount > 0`. */
  aggregateStatus?: string;
}

/**
 * Discover, load, and activate TUI extensions across builtin/profile/repo
 * tiers. Returns after every extension's `activate` has either completed or
 * been isolated as failed; no single extension can prevent startup.
 *
 * Must be awaited BEFORE the first render (i.e. before `NanobossAppView`
 * is constructed) so every contribution is visible on first paint.
 */
export async function bootExtensions(
  cwd: string,
  options: BootExtensionsOptions = {},
): Promise<BootExtensionsResult> {
  const theme = options.theme ?? createNanobossTuiTheme();
  const log = options.log ?? defaultBootLog;
  const registry = options.registry
    ?? new TuiExtensionRegistry({
      cwd,
      profileExtensionRoot: options.profileExtensionRoot,
      extensionRoots: options.extensionRoots,
    });

  if (!options.registry && !options.skipBuiltins) {
    try {
      registry.loadBuiltins();
    } catch (error) {
      log("error", `failed to load builtin extensions: ${formatError(error)}`);
    }
  }

  if (!options.registry && !options.skipDisk) {
    try {
      await registry.loadFromDisk();
    } catch (error) {
      log("error", `failed to load extensions from disk: ${formatError(error)}`);
    }
  }

  const factory = options.contextFactory
    ?? createTuiExtensionContextFactory(theme, log, options.contextFactoryDeps);

  await registry.activateAll(factory);

  const statuses = registry.listMetadata();
  const failedCount = statuses.filter((entry) => entry.status === "failed").length;
  const result: BootExtensionsResult = { registry, failedCount };

  if (failedCount > 0) {
    const aggregate = `[extensions] ${failedCount} extension${failedCount === 1 ? "" : "s"} failed to activate`;
    result.aggregateStatus = aggregate;
    log("error", aggregate);
  }

  return result;
}

function defaultBootLog(level: TuiExtensionBootLogLevel, text: string): void {
  process.stderr.write(`[extension:${level}] ${text}\n`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
