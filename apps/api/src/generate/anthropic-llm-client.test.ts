import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAnthropicLlmClient } from './anthropic-llm-client';
import type { LlmRequest } from './llm-client';

const request: LlmRequest = {
  model: 'claude-sonnet-5-5',
  system: 'sys',
  messages: [{ role: 'user', content: 'hello' }],
  schema: z.object({ answer: z.string() }),
  maxTokens: 1_234,
  effort: 'medium',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const message = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  content: [
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'text', text: '{"answer":' },
    { type: 'text', text: '"yes"}' },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 321, output_tokens: 45 },
};

const apiError = (status: number, type: string, msg: string, details?: object) =>
  json(status, { type: 'error', error: { type, message: msg, ...(details && { details }) } });

/** A fetch that answers from a list and records each request body. */
const fakeFetch = (responses: Response[]) => {
  const bodies: Record<string, unknown>[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = responses.shift();
    if (!next) throw new Error('Unexpected extra request');
    return next;
  };
  return { fetch: fetch as typeof globalThis.fetch, bodies };
};

const clientWith = (responses: Response[]) => {
  const fake = fakeFetch(responses);
  return {
    client: createAnthropicLlmClient({ apiKey: 'sk-test', fetch: fake.fetch }),
    bodies: fake.bodies,
  };
};

describe('AnthropicLlmClient', () => {
  it('sends the schema as structured output, with the cap and effort, and returns the text', async () => {
    const { client, bodies } = clientWith([json(200, message)]);

    const response = await client.generate(request);

    expect(response).toEqual({
      text: '{"answer":"yes"}',
      stopReason: 'end_turn',
      usage: { inputTokens: 321, outputTokens: 45 },
      model: 'claude-sonnet-5-5',
    });
    expect(bodies[0]).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 1_234,
      system: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: expect.objectContaining({ required: ['answer'] }) },
      },
    });
  });

  it('maps the tier spend cap (429 enforced_spend_limit_reached) to spend_limit_reached', async () => {
    const capped = () =>
      apiError(429, 'rate_limit_error', 'Spend limit reached', {
        error_code: 'enforced_spend_limit_reached',
      });
    const { client, bodies } = clientWith([capped(), capped(), capped()]);

    await expect(client.generate(request)).rejects.toMatchObject({
      name: 'LlmError',
      code: 'spend_limit_reached',
      message: expect.stringMatching(/spend limit.*Console/i),
    });
    expect(bodies.length).toBeLessThanOrEqual(2);
  });

  it('maps the Console workspace limit (400 usage limits) to spend_limit_reached', async () => {
    const limit = apiError(
      400,
      'invalid_request_error',
      'You have reached your specified workspace API usage limits. You will regain access on 2026-12-01.',
    );
    const { client, bodies } = clientWith([limit]);

    await expect(client.generate(request)).rejects.toMatchObject({ code: 'spend_limit_reached' });
    expect(bodies).toHaveLength(1);
  });

  it('maps any other API error to llm_request_failed with its status', async () => {
    const { client } = clientWith([
      apiError(400, 'invalid_request_error', 'max_tokens: too large'),
    ]);

    await expect(client.generate(request)).rejects.toMatchObject({
      code: 'llm_request_failed',
      message: expect.stringContaining('400'),
    });
  });

  it('names the key when authentication fails', async () => {
    const { client } = clientWith([apiError(401, 'authentication_error', 'invalid x-api-key')]);

    await expect(client.generate(request)).rejects.toMatchObject({
      code: 'llm_request_failed',
      message: expect.stringContaining('ANTHROPIC_API_KEY'),
    });
  });
});
