import { z } from 'zod';
import { ReportStatus } from './report';

const Count = z.number().int().nonnegative();

/** One post and how often retrieval picked it. Title, url and week are null if the post row is gone. */
export const RetrievedPost = z.object({
  postId: z.number().int(),
  topicTitle: z.string().nullable(),
  /** Position in its topic: several posts of one thread share a title. */
  postNumber: z.number().int().nullable(),
  url: z.string().nullable(),
  weekStart: z.iso.date().nullable(),
  /** Distinct retrieval runs the post appeared in: the ranking key. */
  runs: Count,
  /** Rows logged by a facet query. */
  facetHits: Count,
  /** Rows logged as a trend example for an extracted theme. */
  trendHits: Count,
  lastRetrievedAt: z.iso.datetime(),
});
export type RetrievedPost = z.infer<typeof RetrievedPost>;

/** `GET /api/v1/stats/retrievals?limit=`: the most-retrieved posts (ASSUMPTIONS #33). */
export const RetrievalStatsResponse = z.object({
  totalRuns: Count,
  posts: z.array(RetrievedPost),
});
export type RetrievalStatsResponse = z.infer<typeof RetrievalStatsResponse>;

/** One paid run. A report an A/B run made is inside that run's cost, so it isn't listed (#34). */
export const RunCost = z.object({
  kind: z.enum(['ab', 'report']),
  id: z.string(),
  weekStart: z.iso.date(),
  status: ReportStatus,
  isSample: z.boolean(),
  costUsd: z.number(),
  createdAt: z.iso.datetime(),
});
export type RunCost = z.infer<typeof RunCost>;

/** `GET /api/v1/stats/costs`: runs newest first, and what they cost together. */
export const CostStatsResponse = z.object({
  runs: z.array(RunCost),
  totalUsd: z.number(),
});
export type CostStatsResponse = z.infer<typeof CostStatsResponse>;
