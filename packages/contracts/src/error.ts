import { z } from 'zod';

/** Body of every non-2xx API response. */
export const ErrorResponse = z.object({
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
