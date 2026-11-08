import type { ChunkSearch, SearchHit } from '../embed/embedding-store';
import type { Embedder } from '../embed/embedder';
import { mmr } from './mmr';

export interface Facet {
  id: string;
  /** Shown to people and the LLM. */
  label: string;
  /** Written for the embedder: a full sentence matches better than a two-word label. */
  query: string;
}

export interface RetrievalOptions {
  /** Nearest chunks fetched per facet, before MMR. */
  candidatesPerFacet: number;
  /** Chunks MMR keeps per facet. */
  keepPerFacet: number;
  /** MMR trade-off: 1 = pure relevance, 0 = pure diversity. */
  lambda: number;
}

export interface FacetMatch {
  facetId: string;
  /** 1-based position in the facet's MMR order. */
  rank: number;
  /** Cosine similarity to the facet query. */
  score: number;
}

export interface RetrievedChunk extends SearchHit {
  facets: FacetMatch[];
}

export interface RetrievalDeps {
  embedder: Embedder;
  search: ChunkSearch;
}

export const retrieveWeek = async (
  { embedder, search }: RetrievalDeps,
  { week, facets, ...options }: { week: string; facets: Facet[] } & RetrievalOptions,
): Promise<RetrievedChunk[]> => {
  const perFacet = await Promise.all(
    facets.map(async (facet) => {
      const candidates = await search.search({
        model: embedder.model,
        weekStart: week,
        vector: await embedder.embedQuery(facet.query),
        k: options.candidatesPerFacet,
        withVectors: true,
      });
      const picks = mmr(
        candidates.map((hit) => ({ ...hit, id: hit.chunkId, vector: hit.embedding })),
        { lambda: options.lambda, k: options.keepPerFacet },
      );
      return picks.map(({ id: _id, vector: _vector, embedding: _embedding, ...hit }, i) => ({
        ...hit,
        facets: [{ facetId: facet.id, rank: i + 1, score: hit.score }],
      }));
    }),
  );
  return perFacet.flat();
};
