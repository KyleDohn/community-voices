import { describe, expect, it } from 'vitest';
import type { Embedder } from '../embedder';

const norm = (v: number[]) => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));

/** Behaviour every Embedder must have; run against the fake and the real model. */
export const describeEmbedderContract = (name: string, make: () => Promise<Embedder>) =>
  describe(`${name} (Embedder contract)`, () => {
    it('returns one unit-length vector of the declared size per text', async () => {
      const embedder = await make();

      const vectors = await embedder.embedDocuments(['darktable export crash', 'a photo walk']);

      expect(vectors).toHaveLength(2);
      for (const v of vectors) {
        expect(v).toHaveLength(embedder.dimensions);
        expect(norm(v)).toBeCloseTo(1, 5);
      }
    });

    it('gives the same text the same vector', async () => {
      const embedder = await make();

      const [first] = await embedder.embedDocuments(['same text']);
      const [second] = await embedder.embedDocuments(['same text']);

      expect(second).toEqual(first);
    });

    it('embeds a query differently from the same text as a document', async () => {
      const embedder = await make();

      const [asDocument] = await embedder.embedDocuments(['export crash']);
      const asQuery = await embedder.embedQuery('export crash');

      expect(asQuery).toHaveLength(embedder.dimensions);
      expect(asQuery).not.toEqual(asDocument);
    });

    it('returns nothing for no texts', async () => {
      const embedder = await make();

      expect(await embedder.embedDocuments([])).toEqual([]);
    });
  });
