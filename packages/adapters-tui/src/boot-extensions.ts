import {
  TuiExtensionRegistry,
  type TuiExtensionContextFactory,
  type TuiExtensionContributionCounts,
} from "@nanoboss/tui-extension-catalog";
import type {
  TuiExtensionContext,
  TuiExtensionLogger,
} from "@nanoboss/tui-extension-sdk";

import {
  registerActivityBarSegment as defaultRegisterActivityBarSegment,
  type ActivityBarSegment,
} from "./activity-bar.ts";
import { registerBuiltinTuiExtensions } from "./builtin-extensions.ts";
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
  getPanelRenderer as defaultGetPanelRenderer,
  unregisterPanelRenderer as defaultUnregisterPanelRenderer,
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
  getPanelRenderer?: (rendererId: string) => PanelRenderer | undefined;
  unregisterPanelRenderer?: (rendererId: string) => boolean;
}

/**
 * Build a `TuiExtensionContextFactory` that namespaces every contribution id
 * as `${extensionName}/${id}` before delegating to the real adapters-tui
 * registries. The returned factory is what `TuiExtensionRegistry.activateAll`
 * consumes.
 *
 * When `contributionCounts` is supplied the factory increments the matching
 * counter for each `register*` call made through the returned context. The
 * caller can then read the Map after `activateAll` completes (e.g. to
 * forward counts into `TuiExtensionRegistry.setContributions`).
 */
export function createTuiExtensionContextFactory(
  theme: NanobossTuiTheme,
  log: TuiExtensionBootLog,
  deps: TuiExtensionContextFactoryDeps = {},
  contributionCounts?: Map<string, TuiExtensionContributionCounts>,
): TuiExtensionContextFactory {
  const registerBinding = deps.registerKeyBinding ?? defaultRegisterKeyBinding;
  const registerChrome = deps.registerChromeContribution ?? defaultRegisterChromeContribution;
  const registerSegment = deps.registerActivityBarSegment ?? defaultRegisterActivityBarSegment;
  const registerRenderer = deps.registerPanelRenderer ?? defaultRegisterPanelRenderer;
  const getRenderer = deps.getPanelRenderer ?? defaultGetPanelRenderer;
  const unregisterRenderer = deps.unregisterPanelRenderer ?? defaultUnregisterPanelRenderer;

  return ({ metadata, scope }) => {
    const extensionName = metadata.name;
    const namespace = (id: string) => `${extensionName}/${id}`;

    const getCounts = (): TuiExtensionContributionCounts | undefined => {
      if (!contributionCounts) return undefined;
      let current = contributionCounts.get(extensionName);
      if (!current) {
        current = { bindings: 0, chromeContributions: 0, activityBarSegments: 0, panelRenderers: 0 };
        contributionCounts.set(extensionName, current);
      }
      return current;
    };

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
        const counts = getCounts();
        if (counts) counts.bindings += 1;
      },
      registerChromeContribution(contribution) {
        registerChrome({ ...contribution, id: namespace(contribution.id) });
        const counts = getCounts();
        if (counts) counts.chromeContributions += 1;
      },
      registerActivityBarSegment(segment) {
        registerSegment({ ...segment, id: namespace(segment.id) });
        const counts = getCounts();
        if (counts) counts.activityBarSegments += 1;
      },
      registerPanelRenderer(renderer) {
        // Panel rendererIds are NOT namespaced by extension name — unlike
        // key bindings, chrome, or activity-bar segments. A rendererId is
        // the public contract a procedure targets via ui.panel({ rendererId,
        // ... }); the author of the rendererId (e.g. "acme/files@1") owns
        // the namespacing convention. Namespacing here would make it
        // impossible for a repo/profile extension to shadow a builtin (e.g.
        // override "nb/card@1"), which is the precedence behavior the
        // extension catalog guarantees.
        //
        // Shadowing: if a renderer is already registered for this id, log a
        // warning via ctx.log.warning and replace it. Activation order is
        // builtin → profile → repo, so the highest-precedence tier wins
        // naturally.
        if (getRenderer(renderer.rendererId)) {
          logger.warning(
            `panel renderer "${renderer.rendererId}" shadows a previously-registered renderer`,
          );
          unregisterRenderer(renderer.rendererId);
        }
        registerRenderer(renderer);
        const counts = getCounts();
        if (counts) counts.panelRenderers += 1;
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
  /** Skip seeding adapter-owned builtins. Useful for hermetic tests. */
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
      registerBuiltinTuiExtensions(registry);
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

  const contributionCounts = new Map<string, TuiExtensionContributionCounts>();

  const factory = options.contextFactory
    ?? createTuiExtensionContextFactory(theme, log, options.contextFactoryDeps, contributionCounts);

  await registry.activateAll(factory);

  // Forward captured contribution counts into the registry so the
  // `/extensions` slash command (and anyone else calling listMetadata)
  // sees what each extension registered during activate().
  if (!options.contextFactory) {
    for (const [name, counts] of contributionCounts) {
      registry.setContributions(name, counts);
    }
  }

  const statuses = registry.listMetadata();
  const failedCount = statuses.filter((entry) => entry.status === "failed").length;
  const result: BootExtensionsResult = { registry, failedCount };

  if (failedCount > 0) {
    const plural = failedCount === 1 ? "" : "s";
    const aggregate = `[extensions] ${failedCount} extension${plural} failed to activate`;
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
