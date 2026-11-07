import { z } from 'zod';

export const DependencyStatus = z.enum(['up', 'down']);

/** `loading` while the model reads its weights on boot; search waits for `ready`. */
export const EmbedderStatus = z.enum(['loading', 'ready', 'failed']);
export type EmbedderStatus = z.infer<typeof EmbedderStatus>;

/** `GET /api/v1/health`: liveness plus the state of each dependency. */
export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: DependencyStatus,
  embedder: EmbedderStatus,
});
export type HealthResponse = z.infer<typeof HealthResponse>;
