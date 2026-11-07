import type { EmbeddingStore } from '../embedding-store';

interface StoredChunk {
  id: number;
  text: string;
  embedding: number[] | null;
  embeddingModel: string | null;
}

/** In-memory EmbeddingStore seeded with chunk texts; `chunks` is exposed for assertions. */
export const createMemoryEmbeddingStore = (texts: string[]) => {
  const chunks: StoredChunk[] = texts.map((text, i) => ({
    id: i + 1,
    text,
    embedding: null,
    embeddingModel: null,
  }));

  const store: EmbeddingStore = {
    pendingChunks: async (model, limit) =>
      chunks
        .filter((c) => c.embedding === null || c.embeddingModel !== model)
        .slice(0, limit)
        .map(({ id, text }) => ({ id, text })),
    saveEmbeddings: async (model, rows) => {
      for (const { id, embedding } of rows) {
        const chunk = chunks.find((c) => c.id === id);
        if (chunk) Object.assign(chunk, { embedding, embeddingModel: model });
      }
    },
  };
  return { store, chunks };
};
