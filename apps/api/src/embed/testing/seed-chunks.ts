import type { IngestionRepository } from '../../ingest/ingestion-run';

export interface ChunkSeed {
  text: string;
  /** Monday, `YYYY-MM-DD`. */
  week: string;
  /** Chunks the post splits into, each holding `text`; default 1. */
  parts?: number;
}

/** Stores each seed as its own topic with one post; topic and post ids are 1, 2, 3… */
export const seedChunks = (repo: IngestionRepository, seeds: ChunkSeed[]) =>
  repo.saveCorpus(
    seeds.map(({ text, week, parts = 1 }, i) => {
      const id = i + 1;
      const createdAt = new Date(`${week}T12:00:00Z`);
      const url = `https://forum.test/t/topic-${id}/${id}`;
      return {
        topic: { id, title: `Topic ${id}`, category: 'Software', url, createdAt },
        posts: [
          {
            id,
            topicId: id,
            postNumber: 1,
            username: 'user',
            raw: text,
            createdAt,
            url: `${url}/1`,
          },
        ],
        chunks: Array.from({ length: parts }, (_, chunkIndex) => ({
          postId: id,
          chunkIndex,
          text,
          weekStart: new Date(`${week}T00:00:00Z`),
        })),
      };
    }),
  );
