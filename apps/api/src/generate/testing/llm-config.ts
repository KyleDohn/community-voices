import type { LlmConfig } from '../../config';

/** Short model names keep test expectations readable; prices are round numbers. */
export const testLlmConfig: LlmConfig = {
  steps: {
    extract: { model: 'haiku', maxTokens: 300, effort: 'low' },
    write: { model: 'sonnet', maxTokens: 4_000, effort: 'medium' },
    write_no_rag: { model: 'sonnet', maxTokens: 4_000, effort: 'medium' },
    judge_rubric: { model: 'opus', maxTokens: 2_000, effort: 'medium' },
    judge_pairwise: { model: 'opus', maxTokens: 2_000, effort: 'medium' },
  },
  maxRunCostUsd: 0.5,
  maxAbRunCostUsd: 1.5,
  prices: {
    haiku: { inputPerMillion: 1, outputPerMillion: 5 },
    sonnet: { inputPerMillion: 2, outputPerMillion: 10 },
    opus: {
      inputPerMillion: 4,
      outputPerMillion: 20,
      cacheWritePerMillion: 5,
      cacheReadPerMillion: 0.2,
    },
  },
};
