import type { LlmCall } from '@cv/contracts';
import { z } from 'zod';
import type { LlmConfig, LlmStep } from '../config';
import { costOf, sumCost } from './cost';
import { LlmError, type LlmClient, type LlmResponse } from './llm-client';
import { type Prompt, repairMessage } from './prompts';

export type GenerationErrorCode =
  'no_data' | 'invalid_output' | 'refused' | 'cost_cap_exceeded' | 'internal' | LlmError['code'];

/** A run that stopped; `calls` holds what was spent before it did. */
export class GenerationError extends Error {
  constructor(
    readonly code: GenerationErrorCode,
    message: string,
    readonly calls: LlmCall[],
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

export interface CallerDeps {
  llm: LlmClient;
  config: LlmConfig;
}

/** The dollar cap a run's calls share, and the variable that sets it (named in the error). */
export interface CostCap {
  usd: number;
  envVar: string;
}

export interface CallOptions {
  /** The system prompt is a shared prefix other calls in the run reuse. */
  cacheSystem?: boolean;
}

// English runs about 4 characters per token; 3 overestimates, which is the safe side for a cap.
const estimateTokens = ({ system, messages }: Prompt) =>
  Math.ceil((system.length + messages.reduce((n, m) => n + m.content.length, 0)) / 3);

const validate = <T>(
  response: LlmResponse,
  schema: z.ZodType<T>,
  check: (value: T) => string[],
): { value: T } | { errors: string[] } => {
  if (response.stopReason === 'max_tokens') {
    return { errors: ['The output was cut off at the length limit; write it more concisely.'] };
  }
  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch {
    return { errors: ['The output was not valid JSON.'] };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { errors: [z.prettifyError(parsed.error)] };
  const errors = check(parsed.data);
  return errors.length > 0 ? { errors } : { value: parsed.data };
};

/** Makes a run's LLM calls: enforces one cost cap across them, records each call, allows one repair. */
export const createCaller = (
  { llm, config }: CallerDeps,
  cap: CostCap = { usd: config.maxRunCostUsd, envVar: 'MAX_RUN_COST_USD' },
) => {
  const calls: LlmCall[] = [];

  const call = async (
    step: LlmStep,
    attempt: number,
    prompt: Prompt,
    schema: z.ZodType,
    { cacheSystem = false }: CallOptions,
  ) => {
    const { model, maxTokens, effort } = config.steps[step];
    const inputTokens = estimateTokens(prompt);
    // A cached call may write the whole prompt to the cache, which costs more than plain input.
    const worstCase = costOf(
      cacheSystem
        ? { inputTokens: 0, cacheWriteTokens: inputTokens, outputTokens: maxTokens }
        : { inputTokens, outputTokens: maxTokens },
      model,
      config.prices,
    );
    const spent = sumCost(calls);
    if (spent + worstCase > cap.usd) {
      throw new GenerationError(
        'cost_cap_exceeded',
        `Stopped before the ${step} call: $${spent.toFixed(4)} spent, and the call could cost up to ` +
          `$${worstCase.toFixed(4)}, over the $${cap.usd} cap (${cap.envVar}).`,
        calls,
      );
    }
    let response: LlmResponse;
    try {
      response = await llm.generate({ ...prompt, model, maxTokens, effort, schema, cacheSystem });
    } catch (error) {
      if (error instanceof LlmError) throw new GenerationError(error.code, error.message, calls);
      throw error;
    }
    const { usage } = response;
    // A dated snapshot id isn't in the price table; its alias's price beats losing a paid call.
    const priced = response.model in config.prices ? response.model : model;
    calls.push({
      step,
      attempt,
      model: response.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      costUsd: costOf(usage, priced, config.prices),
    });
    if (response.stopReason === 'refusal') {
      throw new GenerationError('refused', `The model declined the ${step} request.`, calls);
    }
    return response;
  };

  /** One call, and exactly one repair if its output fails the schema or the check. */
  const run = async <T>(
    step: LlmStep,
    prompt: Prompt,
    schema: z.ZodType<T>,
    check: (value: T) => string[],
    options: CallOptions = {},
  ) => {
    const first = await call(step, 1, prompt, schema, options);
    const firstResult = validate(first, schema, check);
    if ('value' in firstResult) return firstResult.value;

    const repair: Prompt = {
      system: prompt.system,
      messages: [
        ...prompt.messages,
        // The API rejects an empty assistant turn; a reply can be all thinking, cut off at the cap.
        { role: 'assistant', content: first.text || '(no output)' },
        repairMessage(firstResult.errors),
      ],
    };
    const second = validate(await call(step, 2, repair, schema, options), schema, check);
    if ('value' in second) return second.value;
    throw new GenerationError(
      'invalid_output',
      `The ${step} output was still invalid after one repair: ${second.errors.join('; ')}`,
      calls,
    );
  };

  return { run, calls };
};

export type Caller = ReturnType<typeof createCaller>;
