import { getEncoding, type TiktokenEncoding } from "js-tiktoken";

import {
  renderProcedureMemoryCardLines,
  renderProcedureMemoryCardsSection,
  renderSessionToolGuidance,
  type ProcedureMemoryCard,
} from "./memory-cards.ts";
import type { DownstreamAgentConfig } from "./types.ts";

const ENCODER_CACHE = new Map<TiktokenEncoding, ReturnType<typeof getEncoding>>();

export interface PromptCardTokenEstimate {
  procedure: string;
  createdAt: string;
  estimatedTokens: number;
}

export interface PromptTokenDiagnostics {
  provider?: string;
  model?: string;
  method: "tiktoken";
  encoding: TiktokenEncoding;
  totalTokens: number;
  userMessageTokens: number;
  memoryCardsTokens?: number;
  guidanceTokens?: number;
  cards: PromptCardTokenEstimate[];
}

export interface ProcedureMemoryCardTokenEstimate {
  method: "tiktoken";
  encoding: TiktokenEncoding;
  estimatedTokens: number;
}

export function estimateDefaultPromptDiagnostics(
  config: DownstreamAgentConfig,
  params: {
    prompt: string;
    cards: ProcedureMemoryCard[];
    includeGuidance: boolean;
    promptIncludesUserMessageLabel: boolean;
  },
): PromptTokenDiagnostics | undefined {
  const encoding = resolveTiktokenEncoding(config);
  if (!encoding) {
    return undefined;
  }

  const estimateTokens = createTokenEstimator(encoding);
  const cardsSection = renderProcedureMemoryCardsSection(params.cards);
  const guidance = params.includeGuidance ? renderSessionToolGuidance() : undefined;
  const userMessage = params.promptIncludesUserMessageLabel ? `User message:\n${params.prompt}` : params.prompt;

  const blocks = [cardsSection, guidance, userMessage].filter((block): block is string => Boolean(block));
  const totalTokens = estimateTokens(blocks.join("\n\n"));
  const userMessageTokens = estimateTokens(userMessage);
  const memoryCardsTokens = cardsSection ? estimateTokens(cardsSection) : undefined;
  const guidanceTokens = guidance ? estimateTokens(guidance) : undefined;

  return {
    provider: config.provider,
    model: config.model,
    method: "tiktoken",
    encoding,
    totalTokens,
    userMessageTokens,
    memoryCardsTokens,
    guidanceTokens,
    cards: params.cards.map((card) => ({
      procedure: card.procedure,
      createdAt: card.createdAt,
      estimatedTokens: estimateTokens(renderProcedureMemoryCardLines(card).join("\n")),
    })),
  };
}

export function estimateProcedureMemoryCardTokens(
  config: DownstreamAgentConfig,
  card: ProcedureMemoryCard,
): ProcedureMemoryCardTokenEstimate | undefined {
  const encoding = resolveTiktokenEncoding(config);
  if (!encoding) {
    return undefined;
  }

  const estimateTokens = createTokenEstimator(encoding);
  return {
    method: "tiktoken",
    encoding,
    estimatedTokens: estimateTokens(renderProcedureMemoryCardLines(card).join("\n")),
  };
}

export function createTokenEstimator(encoding: TiktokenEncoding): (text: string) => number {
  let encoder = ENCODER_CACHE.get(encoding);
  if (!encoder) {
    encoder = getEncoding(encoding);
    ENCODER_CACHE.set(encoding, encoder);
  }

  return (text: string) => encoder.encode(text).length;
}

function resolveTiktokenEncoding(config: DownstreamAgentConfig): TiktokenEncoding | undefined {
  const model = config.model?.toLowerCase();
  if (config.provider === "copilot" || config.provider === "codex") {
    return "o200k_base";
  }

  if (model?.startsWith("gpt-")) {
    return "o200k_base";
  }

  return undefined;
}
