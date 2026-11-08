import type { WeekSummary } from '@cv/contracts';

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
  /** Also return each hit's stored vector, e.g. for MMR; off by default to keep hits small. */
  withVectors?: boolean;
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

export interface VectorHit extends SearchHit {
  embedding: number[];
}

export interface ChunkSearch {
  search(query: SearchQuery & { withVectors: true }): Promise<VectorHit[]>;
  search(query: SearchQuery): Promise<SearchHit[]>;
}

export interface ChunkRepository extends EmbeddingStore, ChunkSearch {
  /** Weeks that have chunks, newest first; `embedded` counts only this model's vectors. */
  listWeeks(model: string): Promise<WeekSummary[]>;
}
