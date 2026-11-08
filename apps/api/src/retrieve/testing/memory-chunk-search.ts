import type { ChunkSearch, SearchHit, SearchQuery, VectorHit } from '../../embed/embedding-store';
import type { Embedder } from '../../embed/embedder';
import { fakeEmbedder, unitVector } from '../../embed/testing/fake-embedder';
import { dot } from '../../embed/vector';

export interface MemoryChunk {
  chunkId: number;
  /** Monday, `YYYY-MM-DD`. */
  week: string;
  /** Normalized on the way in. */
  vector: number[];
}

/** Exact cosine search over hand-placed vectors; post id = chunk id, topic "Topic <id>". */
export const createMemoryChunkSearch = (chunks: MemoryChunk[]): ChunkSearch => {
  function search(query: SearchQuery & { withVectors: true }): Promise<VectorHit[]>;
  function search(query: SearchQuery): Promise<SearchHit[]>;
  async function search({ weekStart, vector, k, withVectors }: SearchQuery) {
    return chunks
      .filter((c) => c.week === weekStart)
      .map((c) => ({ ...c, vector: unitVector(c.vector) }))
      .map(({ chunkId, vector: embedding }) => ({
        chunkId,
        postId: chunkId,
        topicId: chunkId,
        topicTitle: `Topic ${chunkId}`,
        url: `https://forum.test/t/${chunkId}/1`,
        text: `chunk ${chunkId}`,
        score: dot(embedding, unitVector(vector)),
        ...(withVectors && { embedding }),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
  return { search };
};

/** The fake embedder, with each query text mapped to a chosen direction. */
export const scriptedEmbedder = (queries: Record<string, number[]>): Embedder => ({
  ...fakeEmbedder(),
  embedQuery: async (text) => {
    const vector = queries[text];
    if (!vector) throw new Error(`No scripted vector for query "${text}"`);
    return unitVector(vector);
  },
});
