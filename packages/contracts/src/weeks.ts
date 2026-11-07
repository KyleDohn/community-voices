import { z } from 'zod';

export const WeekSummary = z.object({
  /** Monday of the week, UTC, `YYYY-MM-DD`. */
  weekStart: z.iso.date(),
  /** Posts that produced at least one chunk; very short replies are dropped at chunking. */
  posts: z.number().int(),
  chunks: z.number().int(),
  /** Chunks embedded by the current model, so searchable. Below `chunks` while boot embeds. */
  embedded: z.number().int(),
});
export type WeekSummary = z.infer<typeof WeekSummary>;

/** `GET /api/v1/weeks`: weeks that have chunks, newest first. */
export const WeeksResponse = z.object({ weeks: z.array(WeekSummary) });
export type WeeksResponse = z.infer<typeof WeeksResponse>;
