export interface PendingChunk {
  id: number;
  text: string;
}

export interface ChunkEmbedding {
  id: number;
  embedding: number[];
}

/** Where chunk vectors are read from and written to; Postgres in the app, memory in tests. */
export interface EmbeddingStore {
  /** Chunks with no embedding, or one from a different model, in a stable order. */
  pendingChunks(model: string, limit: number): Promise<PendingChunk[]>;
  saveEmbeddings(model: string, rows: ChunkEmbedding[]): Promise<void>;
}
