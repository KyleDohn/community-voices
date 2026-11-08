/** Dot product; for unit vectors it is cosine similarity. */
export const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);
