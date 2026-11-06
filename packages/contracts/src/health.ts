import { z } from 'zod';

export const DependencyStatus = z.enum(['up', 'down']);

/** `GET /api/v1/health`: liveness plus the state of each dependency. */
export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: DependencyStatus,
});
export type HealthResponse = z.infer<typeof HealthResponse>;
