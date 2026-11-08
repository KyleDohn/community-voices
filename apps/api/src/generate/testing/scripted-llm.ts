import type { LlmClient, LlmRequest, LlmResponse } from '../llm-client';

/** One scripted reply: a response (fields default to a clean end_turn), or an error to throw. */
export type ScriptedReply = (Partial<LlmResponse> & { text: string }) | Error;

/** Replies in order and records every request; running past the script fails the test loudly. */
export const scriptedLlm = (replies: ScriptedReply[]) => {
  const requests: LlmRequest[] = [];
  const client: LlmClient = {
    generate: async (request) => {
      requests.push(request);
      const reply = replies[requests.length - 1];
      if (!reply) throw new Error(`Unscripted LLM call #${requests.length}`);
      if (reply instanceof Error) throw reply;
      return {
        stopReason: 'end_turn',
        usage: { inputTokens: 1_000, outputTokens: 500 },
        model: request.model,
        ...reply,
      };
    },
  };
  return { client, requests };
};
