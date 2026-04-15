import type { DownstreamAgentProvider, DownstreamAgentSelection } from "@nanoboss/contracts";

const DOWNSTREAM_AGENT_PROVIDERS: DownstreamAgentProvider[] = ["claude", "gemini", "codex", "copilot"];

export function parseDownstreamAgentSelection(value: unknown): DownstreamAgentSelection | undefined {
  const record = asRecord(value);
  const provider = asProvider(record?.provider);
  if (!provider) {
    return undefined;
  }

  const model = asOptionalNonEmptyString(record?.model);
  return model === undefined ? { provider } : { provider, model };
}

function asProvider(value: unknown): DownstreamAgentProvider | undefined {
  return typeof value === "string" && DOWNSTREAM_AGENT_PROVIDERS.includes(value as DownstreamAgentProvider)
    ? value as DownstreamAgentProvider
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asOptionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
