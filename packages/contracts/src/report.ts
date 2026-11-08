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

/** A post the writer saw, so a citation can link to it. Prior-week ones are trend examples. */
export const ReportSource = z.object({
  postId: PostId,
  url: z.string(),
  topicTitle: z.string(),
  /** Monday, `YYYY-MM-DD`. */
  weekStart: z.iso.date(),
});
export type ReportSource = z.infer<typeof ReportSource>;

/** One LLM call and what it cost; a repair is attempt 2 of its step. */
export const LlmCall = z.object({
  step: z.enum(['extract', 'write']),
  attempt: z.number().int(),
  model: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costUsd: z.number(),
});
export type LlmCall = z.infer<typeof LlmCall>;

/** A Monday, `YYYY-MM-DD`: chunks are keyed by the Monday that starts their week. */
export const WeekStart = z.iso
  .date()
  .refine((day) => new Date(`${day}T00:00:00Z`).getUTCDay() === 1, 'must be a Monday');
export type WeekStart = z.infer<typeof WeekStart>;

/** `POST /api/v1/reports` body. */
export const StartReportRequest = z.object({ week: WeekStart });
export type StartReportRequest = z.infer<typeof StartReportRequest>;

export const ReportStatus = z.enum(['running', 'succeeded', 'failed']);
export type ReportStatus = z.infer<typeof ReportStatus>;

/** Why a run stopped, e.g. `cost_cap_exceeded`, `spend_limit_reached`, `invalid_output`. */
export const ReportError = z.object({ code: z.string(), message: z.string() });
export type ReportError = z.infer<typeof ReportError>;

/** `GET /api/v1/reports/:id`. A failed run still lists the calls it paid for. */
export const ReportRunResponse = z.object({
  id: z.string(),
  weekStart: z.iso.date(),
  status: ReportStatus,
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  retrievalRunId: z.string().nullable(),
  /** The themes extracted by the first call, as used for the trend lookup. */
  themes: z.array(z.string()),
  document: ReportDocument.nullable(),
  sources: z.array(ReportSource),
  calls: z.array(LlmCall),
  costUsd: z.number(),
  error: ReportError.nullable(),
});
export type ReportRunResponse = z.infer<typeof ReportRunResponse>;

export const ReportSummary = ReportRunResponse.pick({
  id: true,
  weekStart: true,
  status: true,
  createdAt: true,
  costUsd: true,
});
export type ReportSummary = z.infer<typeof ReportSummary>;

/** `GET /api/v1/reports?week=`: runs, newest first. */
export const ReportListResponse = z.object({ reports: z.array(ReportSummary) });
export type ReportListResponse = z.infer<typeof ReportListResponse>;
