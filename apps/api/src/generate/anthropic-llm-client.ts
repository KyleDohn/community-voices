import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { type LlmClient, LlmError } from './llm-client';

export interface AnthropicLlmOptions {
  apiKey: string;
  /** Tests pass a fake; the app uses the global fetch. */
  fetch?: typeof globalThis.fetch;
}

// The workspace limit has no typed error_code, only this message (ASSUMPTIONS #29).
const WORKSPACE_LIMIT = /reached your specified (workspace )?API usage limits/i;

const SPEND_LIMIT =
  'API spend limit reached; raise it in the Anthropic Console (Settings > Limits)';

const isSpendLimit = (error: InstanceType<typeof Anthropic.APIError>) =>
  error.errorCode === 'enforced_spend_limit_reached' ||
  (error instanceof Anthropic.BadRequestError && WORKSPACE_LIMIT.test(error.apiMessage ?? ''));

const toLlmError = (error: unknown): unknown => {
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmError('llm_request_failed', 'Could not reach the Anthropic API');
  }
  if (!(error instanceof Anthropic.APIError)) return error;
  if (isSpendLimit(error)) return new LlmError('spend_limit_reached', SPEND_LIMIT);
  if (error instanceof Anthropic.AuthenticationError) {
    return new LlmError(
      'llm_request_failed',
      'The Anthropic API rejected the key; check ANTHROPIC_API_KEY',
    );
  }
  return new LlmError(
    'llm_request_failed',
    `Anthropic API error ${error.status}: ${error.apiMessage ?? error.message}`,
  );
};

export const createAnthropicLlmClient = ({ apiKey, fetch }: AnthropicLlmOptions): LlmClient => {
  // One retry covers a blip; a spend-limit 429 then costs one more rejected (unbilled) request.
  const client = new Anthropic({ apiKey, maxRetries: 1, ...(fetch && { fetch }) });

  return {
    generate: async ({ model, system, messages, schema, maxTokens, effort }) => {
      try {
        const message = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages,
          output_config: { effort, format: zodOutputFormat(schema) },
        });
        return {
          text: message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''),
          stopReason: message.stop_reason ?? 'unknown',
          usage: {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
          },
          model: message.model,
        };
      } catch (error) {
        throw toLlmError(error);
      }
    },
  };
};
