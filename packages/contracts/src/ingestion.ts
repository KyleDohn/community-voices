import { z } from 'zod';

/** `202` body for any long-running job; poll the matching GET with this id. */
export const AcceptedResponse = z.object({ id: z.string() });
export type AcceptedResponse = z.infer<typeof AcceptedResponse>;

export const IngestionStatus = z.enum(['queued', 'running', 'succeeded', 'capped', 'failed']);
export type IngestionStatus = z.infer<typeof IngestionStatus>;

/** `GET /api/v1/ingestions/:id`. A `capped` run stopped at a request or token cap and can be resumed. */
export const IngestionRunResponse = z.object({
  id: z.string(),
  status: IngestionStatus,
  windowStart: z.iso.datetime(),
  windowEnd: z.iso.datetime(),
  maxRequests: z.number().int(),
  maxTokens: z.number().int(),
  topicsStored: z.number().int(),
  postsStored: z.number().int(),
  chunksStored: z.number().int(),
  tokensUsed: z.number().int(),
  error: z.string().nullable(),
});
export type IngestionRunResponse = z.infer<typeof IngestionRunResponse>;
