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

const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);

/** Greedy maximal marginal relevance: each pick trades relevance against similarity to earlier picks. */
export const mmr = <T extends MmrCandidate>(candidates: T[], { lambda, k }: MmrOptions): T[] => {
  const remaining = [...candidates];
  const picked: T[] = [];
  const redundancy = (c: T) =>
    picked.length === 0 ? 0 : Math.max(...picked.map((p) => dot(c.vector, p.vector)));
  const marginal = (c: T) => lambda * c.score - (1 - lambda) * redundancy(c);
  while (picked.length < k && remaining.length > 0) {
    const best = remaining.reduce((a, b) => (marginal(b) > marginal(a) ? b : a));
    picked.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }
  return picked;
};
