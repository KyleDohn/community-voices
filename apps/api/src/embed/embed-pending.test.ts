import { describe, expect, it } from 'vitest';
import type { Embedder } from './embedder';
import { embedPendingChunks } from './embed-pending';
import { fakeEmbedder } from './testing/fake-embedder';
import { createMemoryEmbeddingStore } from './testing/memory-embedding-store';

const texts = (n: number) => Array.from({ length: n }, (_, i) => `chunk ${i + 1}`);

/** Records the size of every batch the embedder is handed. */
const recording = (embedder: Embedder) => {
  const batches: number[] = [];
  const wrapped: Embedder = {
    ...embedder,
    embedDocuments: (batch) => {
      batches.push(batch.length);
      return embedder.embedDocuments(batch);
    },
  };
  return { embedder: wrapped, batches };
};

describe('embedPendingChunks', () => {
  it('embeds every pending chunk, in batches no larger than the batch size', async () => {
    const { store, chunks } = createMemoryEmbeddingStore(texts(5));
    const { embedder, batches } = recording(fakeEmbedder());

    const result = await embedPendingChunks(store, embedder, { batchSize: 2 });

    expect(result).toEqual({ embedded: 5 });
    expect(batches).toEqual([2, 2, 1]);
    const [expected] = await fakeEmbedder().embedDocuments(['chunk 3']);
    expect(chunks[2]).toMatchObject({ embedding: expected, embeddingModel: 'fake-hash-384' });
  });

  it('does nothing on a second run', async () => {
    const { store } = createMemoryEmbeddingStore(texts(3));
    await embedPendingChunks(store, fakeEmbedder(), { batchSize: 2 });
    const { embedder, batches } = recording(fakeEmbedder());

    expect(await embedPendingChunks(store, embedder, { batchSize: 2 })).toEqual({ embedded: 0 });
    expect(batches).toEqual([]);
  });

  it('re-embeds chunks that a different model embedded', async () => {
    const { store, chunks } = createMemoryEmbeddingStore(texts(3));
    await embedPendingChunks(store, fakeEmbedder('old-model'), { batchSize: 10 });

    const result = await embedPendingChunks(store, fakeEmbedder('new-model'), { batchSize: 10 });

    expect(result).toEqual({ embedded: 3 });
    expect(chunks.map((c) => c.embeddingModel)).toEqual(['new-model', 'new-model', 'new-model']);
  });
});
