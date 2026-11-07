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

export interface SearchQuery {
  /** Only chunks embedded by this model share the query's vector space. */
  model: string;
  /** Monday, `YYYY-MM-DD`. */
  weekStart: string;
  vector: number[];
  k: number;
}

export interface SearchHit {
  chunkId: number;
  postId: number;
  topicId: number;
  topicTitle: string;
  /** The post's URL, for citation. */
  url: string;
  text: string;
  /** Cosine similarity: 1 is the same direction, 0 unrelated. */
  score: number;
}

export interface ChunkRepository extends EmbeddingStore {
  search(query: SearchQuery): Promise<SearchHit[]>;
}
