import type { Embedder } from './embedder';
import type { EmbeddingStore } from './embedding-store';

/** Embeds chunks the current model hasn't embedded yet; a no-op once everything is current. */
export const embedPendingChunks = async (
  store: EmbeddingStore,
  embedder: Embedder,
  { batchSize }: { batchSize: number },
) => {
  let embedded = 0;
  for (;;) {
    const batch = await store.pendingChunks(embedder.model, batchSize);
    if (batch.length === 0) return { embedded };
    const vectors = await embedder.embedDocuments(batch.map((c) => c.text));
    await store.saveEmbeddings(
      embedder.model,
      batch.map((c, i) => ({ id: c.id, embedding: vectors[i]! })),
    );
    embedded += batch.length;
  }
};
