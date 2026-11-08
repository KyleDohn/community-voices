import { describe, expect, it } from 'vitest';
import { retrieveWeek } from './retrieve-week';
import { createMemoryChunkSearch, scriptedEmbedder } from './testing/memory-chunk-search';

const week = '2026-10-26';
const options = { candidatesPerFacet: 15, keepPerFacet: 2, lambda: 0.7 };
const releases = { id: 'releases', label: 'New releases', query: 'releases query' };
const embedder = scriptedEmbedder({ 'releases query': [1, 0, 0] });

describe('retrieveWeek', () => {
  it("keeps each facet's MMR picks, labeled with the facet, rank and score", async () => {
    // B nearly duplicates A, so C (as relevant, but different) takes the second slot.
    const search = createMemoryChunkSearch([
      { chunkId: 1, week, vector: [1, 0.2, 0] }, // A
      { chunkId: 2, week, vector: [1, 0.2, 0.02] }, // B
      { chunkId: 3, week, vector: [1, -0.2, 0] }, // C
    ]);

    const chunks = await retrieveWeek(
      { embedder, search },
      { week, facets: [releases], ...options },
    );

    expect(chunks.map((c) => ({ chunkId: c.chunkId, facets: c.facets }))).toEqual([
      { chunkId: 1, facets: [{ facetId: 'releases', rank: 1, score: expect.closeTo(0.981, 3) }] },
      { chunkId: 3, facets: [{ facetId: 'releases', rank: 2, score: expect.closeTo(0.981, 3) }] },
    ]);
  });
});
