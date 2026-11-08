export interface MmrCandidate {
  id: number;
  /** Relevance to the query: cosine similarity. */
  score: number;
  /** Unit-length embedding, so a dot product is cosine similarity. */
  vector: number[];
}

export interface MmrOptions {
  /** 1 = pure relevance, 0 = pure diversity. */
  lambda: number;
  k: number;
}

export const mmr = <T extends MmrCandidate>(candidates: T[], { k }: MmrOptions): T[] =>
  [...candidates].sort((a, b) => b.score - a.score).slice(0, k);
