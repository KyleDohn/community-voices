import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { createPgIngestionRepository } from '../ingest/pg-ingestion-repository';
import { embedPendingChunks } from './embed-pending';
import { createPgChunkRepository } from './pg-chunk-repository';
import { fakeEmbedder, unitVector } from './testing/fake-embedder';
import { seedChunks } from './testing/seed-chunks';

const { pool, db } = connect(process.env.DATABASE_URL!);
const ingestion = createPgIngestionRepository(db);
const chunks = createPgChunkRepository(db);
const week = '2026-11-02';

beforeAll(() => runMigrations(db));
beforeEach(() =>
  db.execute(sql`truncate topics, posts, chunks, ingestion_runs restart identity cascade`),
);
afterAll(() => pool.end());

describe('pg chunk repository: embeddings', () => {
  it('lists unembedded chunks in id order, up to the limit', async () => {
    await seedChunks(ingestion, [
      { text: 'first', week },
      { text: 'second', week },
      { text: 'third', week },
    ]);

    const pending = await chunks.pendingChunks('m', 2);

    expect(pending.map((c) => c.text)).toEqual(['first', 'second']);
  });

  it('has nothing pending once every chunk is embedded, until the model changes', async () => {
    await seedChunks(ingestion, [
      { text: 'first', week },
      { text: 'second', week },
      { text: 'third', week },
    ]);

    expect(await embedPendingChunks(chunks, fakeEmbedder('m1'), { batchSize: 2 })).toEqual({
      embedded: 3,
    });
    expect(await chunks.pendingChunks('m1', 10)).toEqual([]);
    expect(await chunks.pendingChunks('m2', 10)).toHaveLength(3);
  });
});

/** A 384-d unit vector pointing along the given axes. */
const axis = (...dims: number[]) =>
  unitVector(Array.from({ length: 384 }, (_, i) => (dims.includes(i) ? 1 : 0)));

describe('pg chunk repository: search', () => {
  beforeEach(async () => {
    await seedChunks(ingestion, [
      { text: 'exact match', week },
      { text: 'halfway', week },
      { text: 'unrelated', week },
      { text: 'exact match, other week', week: '2026-10-26' },
      { text: 'exact match, other model', week },
    ]);
    await chunks.saveEmbeddings('m', [
      { id: 1, embedding: axis(0) },
      { id: 2, embedding: axis(0, 1) },
      { id: 3, embedding: axis(1) },
      { id: 4, embedding: axis(0) },
    ]);
    await chunks.saveEmbeddings('other', [{ id: 5, embedding: axis(0) }]);
  });

  it("ranks the week's chunks by cosine similarity, scored 1 - distance", async () => {
    const hits = await chunks.search({ model: 'm', weekStart: week, vector: axis(0), k: 10 });

    expect(hits.map((h) => h.text)).toEqual(['exact match', 'halfway', 'unrelated']);
    expect(hits.map((h) => h.score)).toEqual([
      expect.closeTo(1, 5),
      expect.closeTo(Math.SQRT1_2, 5),
      expect.closeTo(0, 5),
    ]);
  });

  it('returns at most k hits, with the post and topic they came from', async () => {
    const hits = await chunks.search({ model: 'm', weekStart: week, vector: axis(0), k: 1 });

    expect(hits).toEqual([
      {
        chunkId: 1,
        postId: 1,
        topicId: 1,
        topicTitle: 'Topic 1',
        url: 'https://forum.test/t/topic-1/1/1',
        text: 'exact match',
        score: expect.closeTo(1, 5),
      },
    ]);
  });

  it("adds each hit's stored vector when asked, for reranking", async () => {
    const hits = await chunks.search({
      model: 'm',
      weekStart: week,
      vector: axis(0),
      k: 2,
      withVectors: true,
    });

    expect(hits.map((h) => h.embedding.map((x) => Number(x.toFixed(5))))).toEqual([
      axis(0).map((x) => Number(x.toFixed(5))),
      axis(0, 1).map((x) => Number(x.toFixed(5))),
    ]);
  });
});

describe('pg chunk repository: weeks', () => {
  it('counts posts, chunks and current-model embeddings per week, newest first', async () => {
    await seedChunks(ingestion, [
      { text: 'a', week },
      { text: 'b', week },
      { text: 'c, split in two', week: '2026-10-26', parts: 2 },
    ]);
    await chunks.saveEmbeddings('m', [{ id: 1, embedding: axis(0) }]);
    await chunks.saveEmbeddings('other', [{ id: 2, embedding: axis(0) }]);

    expect(await chunks.listWeeks('m')).toEqual([
      { weekStart: week, posts: 2, chunks: 2, embedded: 1 },
      { weekStart: '2026-10-26', posts: 1, chunks: 2, embedded: 0 },
    ]);
  });
});
