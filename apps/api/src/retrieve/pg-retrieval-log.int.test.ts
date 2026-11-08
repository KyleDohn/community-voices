import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { seedChunks } from '../embed/testing/seed-chunks';
import { createPgIngestionRepository } from '../ingest/pg-ingestion-repository';
import { createPgRetrievalLog } from './pg-retrieval-log';

const { pool, db } = connect(process.env.DATABASE_URL!);
const log = createPgRetrievalLog(db);
const week = '2026-10-26';

beforeAll(() => runMigrations(db));
beforeEach(async () => {
  await db.execute(
    sql`truncate topics, posts, chunks, ingestion_runs, retrieval_runs restart identity cascade`,
  );
  await seedChunks(createPgIngestionRepository(db), [
    { text: 'a', week },
    { text: 'b', week },
  ]);
});
afterAll(() => pool.end());

describe('pg retrieval log', () => {
  it('stores every entry under a new run, readable by run id', async () => {
    const entries = [
      { chunkId: 1, postId: 1, query: 'releases', rank: 1, score: 0.71 },
      { chunkId: 2, postId: 2, query: 'releases', rank: 2, score: 0.69 },
      { chunkId: 2, postId: 2, query: 'help', rank: 1, score: 0.66 },
    ];

    const runId = await log.record(week, entries);

    expect(await log.entriesFor(runId)).toEqual(
      entries.map((e) => ({ ...e, score: expect.closeTo(e.score, 5) })),
    );
  });

  it('keeps each run separate', async () => {
    const first = await log.record(week, [
      { chunkId: 1, postId: 1, query: 'releases', rank: 1, score: 0.7 },
    ]);
    const second = await log.record(week, [
      { chunkId: 2, postId: 2, query: 'help', rank: 1, score: 0.6 },
    ]);

    expect(first).not.toEqual(second);
    expect((await log.entriesFor(second)).map((e) => e.chunkId)).toEqual([2]);
  });

  it('stores nothing when an entry fails, so no run is left without its rows', async () => {
    await expect(
      log.record(week, [
        { chunkId: 1, postId: 1, query: 'releases', rank: 1, score: 0.7 },
        { chunkId: 999, postId: 9, query: 'releases', rank: 2, score: 0.6 },
      ]),
    ).rejects.toThrow();

    const runs = await db.execute(sql`select count(*)::int as n from retrieval_runs`);
    expect(runs.rows[0]).toEqual({ n: 0 });
  });

  it("keeps a run's entries when re-ingestion drops a chunk, still naming the post", async () => {
    const ingestion = createPgIngestionRepository(db);
    await seedChunks(ingestion, [{ text: 'long post', week, parts: 2 }]);
    const [, secondHalf] = await db
      .execute<{ id: number }>(sql`select id from chunks where post_id = 1 order by chunk_index`)
      .then((r) => r.rows);
    const runId = await log.record(week, [
      { chunkId: secondHalf!.id, postId: 1, query: 'help', rank: 1, score: 0.6 },
    ]);

    await seedChunks(ingestion, [{ text: 'long post, edited down', week }]);

    expect(await log.entriesFor(runId)).toEqual([
      { chunkId: null, postId: 1, query: 'help', rank: 1, score: expect.closeTo(0.6, 5) },
    ]);
  });
});
