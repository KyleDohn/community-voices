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

  it('fails quietly when the model cannot load and nothing is waiting on it', async () => {
    const { store } = createMemoryEmbeddingStore([]);
    const worker = createEmbeddingWorker(() => Promise.reject(new Error('no weights')), store, {
      batchSize: 8,
    });

    // An unhandled rejection here would crash the server; vitest fails the run on one.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(worker.status()).toBe('failed');
  });

  it('keeps accepting passes after one fails', async () => {
    const { store, chunks } = createMemoryEmbeddingStore(['a']);
    let saves = 0;
    const flaky = {
      ...store,
      saveEmbeddings: async (...args: Parameters<typeof store.saveEmbeddings>) => {
        if (saves++ === 0) throw new Error('connection reset');
        return store.saveEmbeddings(...args);
      },
    };
    const worker = createEmbeddingWorker(async () => fakeEmbedder(), flaky, { batchSize: 8 });

    await expect(worker.embedPending()).rejects.toThrow('connection reset');

    expect(await worker.embedPending()).toEqual({ embedded: 1 });
    expect(chunks[0]?.embeddingModel).toBe('fake-hash-384');
  });
});
