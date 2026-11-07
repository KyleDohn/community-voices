import type { Embedder } from '../embedder';

const DIMENSIONS = 384;
const QUERY_MARKER = 'query: ';

/** FNV-1a: a cheap, stable string hash to seed the generator. */
const hash = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

/** mulberry32: a tiny seeded PRNG, so the same text always yields the same vector. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};

export const unitVector = (values: number[]) => {
  const length = Math.sqrt(values.reduce((sum, x) => sum + x * x, 0));
  return values.map((x) => x / length);
};

const hashVector = (text: string) => {
  const next = random(hash(text));
  return unitVector(Array.from({ length: DIMENSIONS }, () => next() - 0.5));
};

/** Deterministic hash-to-vector embedder: no meaning, but stable and correctly shaped. */
export const fakeEmbedder = (model = 'fake-hash-384'): Embedder => ({
  model,
  dimensions: DIMENSIONS,
  embedDocuments: async (texts) => texts.map(hashVector),
  embedQuery: async (text) => hashVector(QUERY_MARKER + text),
});
