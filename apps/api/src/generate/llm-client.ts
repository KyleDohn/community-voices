import type { z } from 'zod';
import type { Effort } from '../config';
import type { TokenUsage } from './cost';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  model: string;
  system: string;
  messages: LlmMessage[];
  /** Sent as structured output; the caller still validates the text it gets back. */
  schema: z.ZodType;
  maxTokens: number;
  effort: Effort;
  /** Mark the system prompt as a cache breakpoint; calls sharing it read it back cheaply. */
  cacheSystem?: boolean;
}

export interface LlmResponse {
  /** The raw JSON text; parsing is the caller's job so a bad reply can be repaired. */
  text: string;
  /** `end_turn`, `max_tokens` (cut off), `refusal`, … as the API reports it. */
  stopReason: string;
  usage: TokenUsage;
  /** The model that answered, for pricing. */
  model: string;
}

/** The LLM boundary: Anthropic in the app, a scripted fake in tests. */
export interface LlmClient {
  generate(request: LlmRequest): Promise<LlmResponse>;
}

export type LlmErrorCode = 'spend_limit_reached' | 'llm_request_failed';

/** A failed request, already classified; the client has done whatever retrying it will do. */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
