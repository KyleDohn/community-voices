import { describe, expect, it } from 'vitest';
import { retrieveWeek } from './retrieve-week';
import { createMemoryChunkSearch, scriptedEmbedder } from './testing/memory-chunk-search';

const week = '2026-10-26';
const options = { candidatesPerFacet: 15, keepPerFacet: 2, lambda: 0.7 };
const releases = { id: 'releases', label: 'New releases', query: 'releases query' };
const help = { id: 'help', label: 'Help requests', query: 'help query' };
const embedder = scriptedEmbedder({ 'releases query': [1, 0, 0], 'help query': [0, 0, 1] });

describe('retrieveWeek', () => {
  it("keeps each facet's MMR picks, labeled with the facet, rank and score", async () => {
    // B is more relevant than C but nearly duplicates A, so MMR gives C the second slot.
    const search = createMemoryChunkSearch([
      { chunkId: 1, week, vector: [1, 0.2, 0] }, // A
      { chunkId: 2, week, vector: [1, 0.2, 0.02] }, // B
      { chunkId: 3, week, vector: [1, -0.25, 0] }, // C
    ]);

    const chunks = await retrieveWeek(
      { embedder, search },
      { week, facets: [releases], ...options },
    );

    expect(chunks.map((c) => ({ chunkId: c.chunkId, facets: c.facets }))).toEqual([
      { chunkId: 1, facets: [{ facetId: 'releases', rank: 1, score: expect.closeTo(0.981, 3) }] },
      { chunkId: 3, facets: [{ facetId: 'releases', rank: 2, score: expect.closeTo(0.97, 3) }] },
    ]);
  });

  it('merges a chunk found by two facets into one entry that keeps both labels', async () => {
    const search = createMemoryChunkSearch([
      { chunkId: 1, week, vector: [1, 0, 0] },
      { chunkId: 2, week, vector: [1, 0, 1] },
      { chunkId: 3, week, vector: [0, 0, 1] },
    ]);

    const chunks = await retrieveWeek(
      { embedder, search },
      { week, facets: [releases, help], ...options },
    );

    expect(chunks.map((c) => [c.chunkId, c.facets.map((f) => `${f.facetId}#${f.rank}`)])).toEqual([
      [1, ['releases#1']],
      [2, ['releases#2', 'help#2']],
      [3, ['help#1']],
    ]);
  });

  it('reranks only the top candidatesPerFacet hits', async () => {
    const search = createMemoryChunkSearch([
      { chunkId: 1, week, vector: [1, 0.2, 0] },
      { chunkId: 2, week, vector: [1, 0.2, 0.02] },
      { chunkId: 3, week, vector: [1, -0.25, 0] },
    ]);

    const chunks = await retrieveWeek(
      { embedder, search },
      { week, facets: [releases], ...options, candidatesPerFacet: 2 },
    );

    expect(chunks.map((c) => c.chunkId)).toEqual([1, 2]);
  });
});
