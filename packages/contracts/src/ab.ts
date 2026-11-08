import { z } from 'zod';
import {
  LlmCall,
  ReportDocument,
  ReportError,
  ReportRunResponse,
  ReportStatus,
  WeekStart,
} from './report';

const PostIds = z.array(z.number().int());

/** Deterministic citation counts for one document; id lists are sorted and unique. */
export const CitationChecks = z.object({
  /** Themes, notable threads, the mood and predictions: each one is a claim. */
  claims: z.number().int(),
  uncitedClaims: z.number().int(),
  /** Every citation, repeats included. */
  citations: z.number().int(),
  /** Cited ids with no post in the ingested weeks: invented, or real but older than the corpus. */
  notInCorpus: PostIds,
  /** Real posts from the wrong week; predictions may cite earlier weeks (ASSUMPTIONS #27). */
  outsideWeek: PostIds,
  /** Real posts the RAG writer never saw. */
  notRetrieved: PostIds,
});
export type CitationChecks = z.infer<typeof CitationChecks>;

const Score = z.object({ score: z.number().int().min(1).max(5), reason: z.string() });

/** What the judge returns for one document, scored alone. */
export const RubricScores = z.object({
  grounding: Score,
  specificity: Score,
  coverage: Score,
  predictionPlausibility: Score,
  readability: Score,
});
export type RubricScores = z.infer<typeof RubricScores>;

/** What the judge returns when comparing documents X and Y. */
export const PairwiseAnswer = z.object({
  winner: z.enum(['X', 'Y', 'tie']),
  reason: z.string(),
});
export type PairwiseAnswer = z.infer<typeof PairwiseAnswer>;

export const Variant = z.enum(['rag', 'no_rag']);
export type Variant = z.infer<typeof Variant>;

const Verdict = z.enum(['rag', 'no_rag', 'tie']);

/** Two passes with the order swapped, mapped back to variants; a split is a tie. */
export const PairwiseResult = z.object({
  passes: z.array(z.object({ x: Variant, winner: Verdict, reason: z.string() })).length(2),
  winner: Verdict,
});
export type PairwiseResult = z.infer<typeof PairwiseResult>;

const ByVariant = <T extends z.ZodType>(schema: T) => z.object({ rag: schema, no_rag: schema });

/** `POST /api/v1/ab-runs` body. */
export const StartAbRunRequest = z.object({ week: WeekStart });
export type StartAbRunRequest = z.infer<typeof StartAbRunRequest>;

/** `GET /api/v1/ab-runs/:id`. Each result is null until the run gets that far. */
export const AbRunResponse = z.object({
  id: z.string(),
  weekStart: z.iso.date(),
  status: ReportStatus,
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  /** The committed sample run, not live output (ASSUMPTIONS #12). */
  isSample: z.boolean(),
  /** Variant B: the RAG report this run generated, stored as a report run. */
  ragReport: ReportRunResponse.nullable(),
  /** Variant A. */
  noRagDocument: ReportDocument.nullable(),
  checks: ByVariant(CitationChecks).nullable(),
  rubric: ByVariant(RubricScores).nullable(),
  pairwise: PairwiseResult.nullable(),
  /** Every call in the run, the RAG report's included. */
  calls: z.array(LlmCall),
  costUsd: z.number(),
  error: ReportError.nullable(),
});
export type AbRunResponse = z.infer<typeof AbRunResponse>;

export const AbRunSummary = AbRunResponse.pick({
  id: true,
  weekStart: true,
  status: true,
  createdAt: true,
  costUsd: true,
  isSample: true,
});
export type AbRunSummary = z.infer<typeof AbRunSummary>;

/** `GET /api/v1/ab-runs`: runs, newest first. */
export const AbRunListResponse = z.object({ abRuns: z.array(AbRunSummary) });
export type AbRunListResponse = z.infer<typeof AbRunListResponse>;
