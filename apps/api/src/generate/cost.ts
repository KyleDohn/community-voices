import type { LlmCall } from '@cv/contracts';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** US dollars per million tokens. */
export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
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
  return (
    (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) /
    1_000_000
  );
};

/** Total dollars across a run's calls. */
export const sumCost = (calls: LlmCall[]) => calls.reduce((sum, c) => sum + c.costUsd, 0);
