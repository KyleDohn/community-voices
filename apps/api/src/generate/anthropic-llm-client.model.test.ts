import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadConfig } from '../config';
import { costOf } from './cost';
import { createAnthropicLlmClient } from './anthropic-llm-client';

// Opt-in (`pnpm test:model`) and paid: one tiny Haiku call, well under $0.001.
const config = loadConfig(process.env);
const { apiKey, llm } = { apiKey: config.anthropicApiKey, llm: config.llm };

describe.skipIf(!apiKey)('Anthropic API (real call)', () => {
  it('returns JSON matching the structured-output schema, with usage', async () => {
    const client = createAnthropicLlmClient({ apiKey: apiKey! });
    const Answer = z.object({ colour: z.string(), count: z.number().int() });

    const response = await client.generate({
      model: llm.steps.extract.model,
      system: 'Answer in the requested JSON format.',
      messages: [{ role: 'user', content: 'Name one colour and how many letters it has.' }],
      schema: Answer,
      maxTokens: 300,
      effort: 'low',
    });

    expect(response.stopReason).toBe('end_turn');
    expect(Answer.safeParse(JSON.parse(response.text)).success).toBe(true);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(costOf(response.usage, response.model, llm.prices)).toBeLessThan(0.001);
  });
});
