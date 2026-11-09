import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { UMAP } from 'umap-js';

export interface Point2d {
  x: number;
  y: number;
}

/** mulberry32: umap-js takes a `random` function, and a seeded one makes the layout reproducible. */
const seededRandom = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const EPOCHS_PER_YIELD = 10;

/** UMAP to 2D. Only the neighbour graph blocks (about 1.7 s at 3.4k vectors, ASSUMPTIONS #36). */
export const projectVectors = async (
  vectors: number[][],
  { seed }: { seed: number },
): Promise<Point2d[]> => {
  // umap-js needs at least one neighbour per point, so a lone point just sits at the origin.
  if (vectors.length < 2) return vectors.map(() => ({ x: 0, y: 0 }));
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.max(1, Math.min(15, vectors.length - 1)),
    random: seededRandom(seed),
  });
  const epochs = umap.initializeFit(vectors);
  for (let epoch = 0; epoch < epochs; epoch++) {
    umap.step();
    if (epoch % EPOCHS_PER_YIELD === 0) await yieldToEventLoop();
  }
  // nComponents is 2, so both exist; NaN rather than 0 if not, so the gap is visible.
  return umap.getEmbedding().map(([x = NaN, y = NaN]) => ({ x, y }));
};
