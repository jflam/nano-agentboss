import {
  discoverAgentCatalog,
  formatAgentCatalogRefreshError,
  findSelectableModelOptionInCatalog,
  getProviderLabel,
  getAgentTokenUsagePercent,
  isKnownAgentProvider,
  listKnownProviders,
  listSelectableModelOptionsFromCatalog,
  isKnownModelSelectionInCatalog,
} from "@nanoboss/agent-acp";
import { formatAgentBanner, type AgentTokenUsage, type Procedure } from "@nanoboss/procedure-sdk";

interface ModelProcedureDeps {
  discoverAgentCatalog?: typeof discoverAgentCatalog;
}

export function createModelProcedure(deps: ModelProcedureDeps = {}): Procedure {
  return {
    name: "model",
    description: "Set or inspect the default agent/model for this session",
    inputHint: "[agent] [model]",
    executionMode: "harness",
    async execute(prompt, ctx) {
      const trimmed = prompt.trim();
      const current = ctx.session.getDefaultAgentConfig();
      const currentBanner = formatAgentBanner(current);

      if (!trimmed) {
        const usage = await ctx.session.getDefaultAgentTokenUsage();
        const contextLine = formatObservedContext(usage);

        return {
          display: [
            `Current default agent: ${currentBanner}`,
            contextLine,
            contextLine ? `Context source: ${usage?.source}` : undefined,
            contextLine ? "" : undefined,
            "Use `/model <agent>` to list models.",
            "Use `/model <agent> <model>` to switch.",
            "In the TTY CLI, plain `/model` opens an interactive picker and can save the choice for future runs.",
            "",
            "Available agents:",
            ...listKnownProviders().map((provider) => `- ${provider} (${getProviderLabel(provider)})`),
            "",
          ].filter(Boolean).join("\n"),
          summary: contextLine ? `model: ${currentBanner} ${contextLine}` : `model: ${currentBanner}`,
        };
      }

      const [rawProvider, ...rest] = trimmed.split(/\s+/);
      if (!rawProvider || !isKnownAgentProvider(rawProvider)) {
        return {
          display: [
            `Unknown agent: ${rawProvider ?? trimmed}`,
            "",
            "Known agents:",
            ...listKnownProviders().map((provider) => `- ${provider}`),
            "",
          ].join("\n"),
          summary: "model: unknown agent",
        };
      }

      let catalog: Awaited<ReturnType<typeof discoverAgentCatalog>>;
      try {
        catalog = await discoverCatalog(rawProvider, ctx.cwd, deps);
      } catch (error) {
        return {
          display: [
            formatAgentCatalogRefreshError(rawProvider, error),
            "",
            `Use \`/model ${rawProvider}\` to retry model discovery.`,
            "",
          ].join("\n"),
          summary: `model: refresh ${rawProvider} failed`,
        };
      }

      if (rest.length === 0) {
        const models = listSelectableModelOptionsFromCatalog(catalog);
        return {
          display: [
            `Models for ${catalog.label}:`,
            ...(models.length > 0
              ? []
              : ["- No models advertised by the harness."]),
            ...models.map((model) => {
              const suffix = model.description ? ` — ${model.description}` : "";
              return `- ${model.value}${suffix}`;
            }),
            "",
            `Use \`/model ${rawProvider} <model>\` to switch.`,
            "",
          ].join("\n"),
          summary: `model: list ${rawProvider}`,
        };
      }

      const modelSelection = rest.join(" ").trim();
      if (!isKnownModelSelectionInCatalog(catalog, modelSelection)) {
        return {
          display: [
            `Unknown ${rawProvider} model: ${modelSelection}`,
            "",
            `Use \`/model ${rawProvider}\` to see the available models.`,
            "",
          ].join("\n"),
          summary: `model: invalid ${rawProvider}`,
        };
      }

      const nextConfig = ctx.session.setDefaultAgentSelection({
        provider: rawProvider,
        model: modelSelection,
      });
      const option = findSelectableModelOptionInCatalog(catalog, modelSelection);
      const nextBanner = formatAgentBanner(nextConfig);

      return {
        data: {
          provider: rawProvider,
          model: modelSelection,
        },
        display: [
          `Default agent set to ${nextBanner}.`,
          option ? `Model: ${option.label}` : undefined,
          option?.description ? `Details: ${option.description}` : undefined,
          "Future /default turns will start a fresh conversation with this selection.",
          "",
        ].filter(Boolean).join("\n"),
        summary: `model: ${nextBanner}`,
      };
    },
  } satisfies Procedure;
}

export default createModelProcedure();

async function discoverCatalog(
  provider: Parameters<typeof discoverAgentCatalog>[0],
  cwd: string,
  deps: ModelProcedureDeps,
): Promise<Awaited<ReturnType<typeof discoverAgentCatalog>>> {
  return await (deps.discoverAgentCatalog ?? discoverAgentCatalog)(provider, {
    config: { cwd },
  });
}

function formatObservedContext(usage: AgentTokenUsage | undefined): string | undefined {
  if (!usage || usage.currentContextTokens === undefined) {
    return undefined;
  }

  if (usage.maxContextTokens === undefined) {
    return `Last observed context: ${formatInt(usage.currentContextTokens)} tokens in use`;
  }

  return `Last observed context: ${formatInt(usage.currentContextTokens)} / ${formatInt(usage.maxContextTokens)} tokens (${formatPercent(getAgentTokenUsagePercent(usage) ?? 0)})`;
}

function formatInt(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}
