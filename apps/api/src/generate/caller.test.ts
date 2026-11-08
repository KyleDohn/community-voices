import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { LlmConfig } from '../config';
import { createCaller, GenerationError } from './caller';
import { testLlmConfig } from './testing/llm-config';
import { scriptedLlm } from './testing/scripted-llm';

const config: LlmConfig = {
  ...testLlmConfig,
  steps: {
    ...testLlmConfig.steps,
    extract: { model: 'sonnet', maxTokens: 100, effort: 'low' },
    write: { model: 'sonnet', maxTokens: 100, effort: 'medium' },
  },
  maxRunCostUsd: 0.5,
  prices: {
    sonnet: {
      inputPerMillion: 2,
      outputPerMillion: 10,
      cacheWritePerMillion: 100,
      cacheReadPerMillion: 1,
    },
  },
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

  it('passes cacheSystem through and records cache usage and its cost', async () => {
    const cachedReply = {
      ...reply,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000 },
    };
    const llm = scriptedLlm([cachedReply]);
    const caller = createCaller({ llm: llm.client, config });

    await caller.run('write', prompt, Answer, () => [], { cacheSystem: true });

    expect(llm.requests[0]!.cacheSystem).toBe(true);
    expect(caller.calls[0]).toMatchObject({ cacheReadTokens: 1_000, cacheWriteTokens: 0 });
    expect(caller.calls[0]!.costUsd).toBeCloseTo(0.001, 10);
  });

  it("prices a cached call's worst-case input as a cache write", async () => {
    // 3,000 characters is about 1,000 tokens: $0.002 as plain input, $0.10 as a cache write.
    const big = { system: 'x'.repeat(3_000), messages: [] };
    const cap = { usd: 0.05, envVar: 'CAP' };
    const plain = createCaller({ llm: scriptedLlm([reply]).client, config }, cap);
    await expect(plain.run('write', big, Answer, () => [])).resolves.toEqual({ ok: true });

    const cached = createCaller({ llm: scriptedLlm([reply]).client, config }, cap);
    await expect(
      cached.run('write', big, Answer, () => [], { cacheSystem: true }),
    ).rejects.toMatchObject({ code: 'cost_cap_exceeded' });
  });

  it('keeps cacheSystem on the repair call', async () => {
    const llm = scriptedLlm([{ text: 'not json' }, reply]);
    const caller = createCaller({ llm: llm.client, config });

    await caller.run('write', prompt, Answer, () => [], { cacheSystem: true });

    expect(llm.requests.map((r) => r.cacheSystem)).toEqual([true, true]);
  });
});
