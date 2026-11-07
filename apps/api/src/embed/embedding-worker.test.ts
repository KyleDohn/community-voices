import { describe, expect, it } from 'vitest';
import type { Embedder } from './embedder';
import { createEmbeddingWorker } from './embedding-worker';
import { fakeEmbedder } from './testing/fake-embedder';
import { createMemoryEmbeddingStore } from './testing/memory-embedding-store';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe('createEmbeddingWorker', () => {
  it('reports loading until the model is in memory, then ready', async () => {
    const model = deferred<Embedder>();
    const { store } = createMemoryEmbeddingStore([]);
    const worker = createEmbeddingWorker(() => model.promise, store, { batchSize: 8 });

    expect(worker.status()).toBe('loading');
    model.resolve(fakeEmbedder());
    await worker.embedder;

    expect(worker.status()).toBe('ready');
  });

  it('reports failed when the model cannot load', async () => {
    const { store } = createMemoryEmbeddingStore([]);
    const worker = createEmbeddingWorker(() => Promise.reject(new Error('no weights')), store, {
      batchSize: 8,
    });

    await expect(worker.embedder).rejects.toThrow('no weights');
    expect(worker.status()).toBe('failed');
  });

  it('embeds each pending chunk once, even when passes are requested together', async () => {
    const { store, chunks } = createMemoryEmbeddingStore(['a', 'b', 'c']);
    let embeddedTexts = 0;
    const counting: Embedder = {
      ...fakeEmbedder(),
      embedDocuments: (texts) => {
        embeddedTexts += texts.length;
        return fakeEmbedder().embedDocuments(texts);
      },
    };
    const worker = createEmbeddingWorker(async () => counting, store, { batchSize: 2 });

    await Promise.all([worker.embedPending(), worker.embedPending()]);

    expect(embeddedTexts).toBe(3);
    expect(chunks.every((c) => c.embeddingModel === 'fake-hash-384')).toBe(true);
  });
});
