import type { LlmCall } from '@cv/contracts';

export interface TokenUsage {
  /** Uncached input only; the API counts cache writes and reads separately. */
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

/** US dollars per million tokens. Cache prices are set only for models we cache (the judge). */
export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
  /** 5-minute TTL write. */
  cacheWritePerMillion?: number;
  cacheReadPerMillion?: number;
}

export type PriceTable = Record<string, ModelPrice>;

const priceOf = (model: string, prices: PriceTable): ModelPrice => {
  const price = prices[model];
  // A silent $0 would hide spend from the cost cap.
  if (!price) throw new Error(`No price configured for model ${model}`);
  return price;
};

export const costOf = (usage: TokenUsage, model: string, prices: PriceTable): number => {
  const price = priceOf(model, prices);
  const { cacheWriteTokens = 0, cacheReadTokens = 0 } = usage;
  const cached = cacheWriteTokens + cacheReadTokens > 0;
  if (
    cached &&
    (price.cacheWritePerMillion === undefined || price.cacheReadPerMillion === undefined)
  ) {
    throw new Error(`No cache price configured for model ${model}`);
  }
  return (
    (usage.inputTokens * price.inputPerMillion +
      usage.outputTokens * price.outputPerMillion +
      cacheWriteTokens * (price.cacheWritePerMillion ?? 0) +
      cacheReadTokens * (price.cacheReadPerMillion ?? 0)) /
    1_000_000
  );
};

/** Total dollars across a run's calls. */
export const sumCost = (calls: LlmCall[]) => calls.reduce((sum, c) => sum + c.costUsd, 0);
