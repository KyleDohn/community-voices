import { describe, expect, it } from 'vitest';
import { costOf } from './cost';

const prices = {
  'claude-sonnet-5-5': { inputPerMillion: 2, outputPerMillion: 10 },
  'claude-haiku-5-5': { inputPerMillion: 0.1, outputPerMillion: 0.5 },
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
    expect(() => costOf({ inputTokens: 1, outputTokens: 1 }, 'claude-opus-5-5', prices)).toThrow(
      /no price.*claude-opus-5-5/i,
    );
  });
});
