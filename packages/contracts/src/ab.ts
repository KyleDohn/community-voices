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
