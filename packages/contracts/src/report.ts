import { z } from 'zod';

/** A Discourse post id, the unit every citation points to. */
export const PostId = z.number().int().positive();
export type PostId = z.infer<typeof PostId>;

// Empty is allowed: the no-RAG variant has nothing to cite, and phase 5 counts uncited claims.
const Citations = z
  .array(PostId)
  .describe('Post ids from the supplied context that back this claim');

export const Theme = z.object({
  title: z.string(),
  summary: z.string(),
  approxPostCount: z.number().int(),
  citations: Citations,
});
export type Theme = z.infer<typeof Theme>;

export const NotableThread = z.object({
  title: z.string(),
  why: z.string().describe('Why this thread stands out this week'),
  citations: Citations,
});
export type NotableThread = z.infer<typeof NotableThread>;

export const Mood = z.object({ summary: z.string(), citations: Citations });
export type Mood = z.infer<typeof Mood>;

export const Confidence = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof Confidence>;

export const Prediction = z.object({
  claim: z.string(),
  rationale: z.string(),
  confidence: Confidence,
  citations: Citations,
});
export type Prediction = z.infer<typeof Prediction>;

/** The weekly community report, as written by the LLM and validated with this schema. */
export const ReportDocument = z.object({
  themes: z.array(Theme),
  notableThreads: z.array(NotableThread),
  mood: Mood,
  predictions: z.array(Prediction),
});
export type ReportDocument = z.infer<typeof ReportDocument>;
