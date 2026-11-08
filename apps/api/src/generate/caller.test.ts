import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { LlmConfig } from '../config';
import { createCaller, GenerationError } from './caller';
import { scriptedLlm } from './testing/scripted-llm';

const config: LlmConfig = {
  steps: {
    extract: { model: 'sonnet', maxTokens: 100, effort: 'low' },
    write: { model: 'sonnet', maxTokens: 100, effort: 'medium' },
  },
  maxRunCostUsd: 0.5,
  prices: { sonnet: { inputPerMillion: 2, outputPerMillion: 10 } },
};

const Answer = z.object({ ok: z.boolean() });
const prompt = { system: 's', messages: [{ role: 'user' as const, content: 'q' }] };
// 1,000 in + 1,000 out on these prices is $0.012, so one call fits a $0.01 cap's worst case but two don't.
const reply = { text: '{"ok":true}', usage: { inputTokens: 1_000, outputTokens: 1_000 } };

describe('createCaller', () => {
  it('shares one spend total across every step it runs', async () => {
    const llm = scriptedLlm([reply, reply]);
    const caller = createCaller(
      { llm: llm.client, config },
      { usd: 0.01, envVar: 'MAX_AB_RUN_COST_USD' },
    );

    await caller.run('extract', prompt, Answer, () => []);
    const second = caller.run('write', prompt, Answer, () => []);

    await expect(second).rejects.toMatchObject({ code: 'cost_cap_exceeded' });
    await expect(second).rejects.toThrow(/MAX_AB_RUN_COST_USD/);
    expect(llm.requests).toHaveLength(1);
    expect(caller.calls).toHaveLength(1);
  });

  it('defaults to the report cap', async () => {
    const caller = createCaller({
      llm: scriptedLlm([]).client,
      config: { ...config, maxRunCostUsd: 0 },
    });
    const error = await caller.run('write', prompt, Answer, () => []).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationError);
    expect(String(error)).toMatch(/MAX_RUN_COST_USD/);
  });
});
