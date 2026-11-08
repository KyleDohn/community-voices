import { describe, expect, it } from 'vitest';
import { costOf } from './cost';

const prices = {
  'claude-sonnet-5-5': { inputPerMillion: 2, outputPerMillion: 10 },
  'claude-haiku-5-5': { inputPerMillion: 0.1, outputPerMillion: 0.5 },
  'claude-opus-5-5': {
    inputPerMillion: 4,
    outputPerMillion: 20,
    cacheWritePerMillion: 5,
    cacheReadPerMillion: 0.2,
  },
};

describe('costOf', () => {
  it('prices input and output tokens per million', () => {
    // 10k in at $2/M = $0.02; 2k out at $10/M = $0.02.
    const cost = costOf({ inputTokens: 10_000, outputTokens: 2_000 }, 'claude-sonnet-5-5', prices);
    expect(cost).toBeCloseTo(0.04, 10);
  });

  it('uses the price of the model that answered', () => {
    // 100k in at $0.10/M = $0.01; 10k out at $0.50/M = $0.005.
    const cost = costOf({ inputTokens: 100_000, outputTokens: 10_000 }, 'claude-haiku-5-5', prices);
    expect(cost).toBeCloseTo(0.015, 10);
  });

  it('throws for a model with no price, rather than reporting $0', () => {
    expect(() => costOf({ inputTokens: 1, outputTokens: 1 }, 'claude-fable-5-1', prices)).toThrow(
      /no price.*claude-fable-5-1/i,
    );
  });

  it('prices cache writes and cache reads on top of uncached input and output', () => {
    // 1k in at $4/M = $0.004; 1k out at $20/M = $0.02; 20k written at $5/M = $0.10; 10k read at $0.20/M = $0.002.
    const usage = {
      inputTokens: 1_000,
      outputTokens: 1_000,
      cacheWriteTokens: 20_000,
      cacheReadTokens: 10_000,
    };
    expect(costOf(usage, 'claude-opus-5-5', prices)).toBeCloseTo(0.126, 10);
  });

  it('throws for cache tokens on a model with no cache price', () => {
    const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1 };
    expect(() => costOf(usage, 'claude-sonnet-5-5', prices)).toThrow(
      /cache price.*claude-sonnet-5-5/i,
    );
  });
});
