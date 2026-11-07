import type { IngestionRepository } from '../../ingest/ingestion-run';

export interface ChunkSeed {
  text: string;
  /** Monday, `YYYY-MM-DD`. */
  week: string;
}

/** Stores each seed as its own topic with one post and one chunk; ids are 1, 2, 3… */
export const seedChunks = (repo: IngestionRepository, seeds: ChunkSeed[]) =>
  repo.saveCorpus(
    seeds.map(({ text, week }, i) => {
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
        chunks: [{ postId: id, chunkIndex: 0, text, weekStart: new Date(`${week}T00:00:00Z`) }],
      };
    }),
  );
