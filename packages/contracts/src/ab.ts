import { z } from 'zod';

const PostIds = z.array(z.number().int());

/** Deterministic citation counts for one document; id lists are sorted and unique. */
export const CitationChecks = z.object({
  /** Themes, notable threads, the mood and predictions: each one is a claim. */
  claims: z.number().int(),
  uncitedClaims: z.number().int(),
  /** Every citation, repeats included. */
  citations: z.number().int(),
  /** Cited ids that match no post in the corpus: invented. */
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
