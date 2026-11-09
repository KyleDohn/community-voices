import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { EMBEDDING_DIMENSIONS } from '../config';
import { chunks, posts, retrievalRuns, retrievals, topics } from '../db/schema';
import { createPgMapStore } from './pg-map-store';

const { pool, db } = connect(process.env.DATABASE_URL!);
const store = createPgMapStore(db);

beforeAll(() => runMigrations(db));
afterAll(() => pool.end());

const vector = (first: number) => [first, ...Array<number>(EMBEDDING_DIMENSIONS - 1).fill(0)];
const post = (id: number, postNumber: number) => ({
  id,
  topicId: 1,
  postNumber,
  username: 'u',
  raw: 'r',
  createdAt: new Date('2026-10-27T12:00:00Z'),
  url: `https://forum.test/t/1/${postNumber}`,
});

beforeEach(async () => {
  await db.execute(
    sql`truncate topics, posts, chunks, map_points, retrieval_runs, retrievals restart identity cascade`,
  );
  await db.insert(topics).values({
    id: 1,
    title: 'darktable 5.4',
    category: 'c',
    url: 'https://forum.test/t/1',
    createdAt: new Date('2026-10-27T00:00:00Z'),
  });
  await db.insert(posts).values([post(10, 1), post(20, 2)]);
  const chunk = (
    postId: number,
    chunkIndex: number,
    embedding: number[] | null,
    model: string | null,
  ) => ({
    postId,
    chunkIndex,
    text: 't',
    embedding,
    embeddingModel: model,
    weekStart: '2026-10-26',
  });
  // Ids 1–4: two chunks of post 10, one of post 20, one embedded by another model, one not embedded.
  await db
    .insert(chunks)
    .values([
      chunk(10, 0, vector(0.1), 'bge'),
      chunk(10, 1, vector(0.2), 'bge'),
      chunk(20, 0, vector(0.3), 'bge'),
      chunk(20, 1, vector(0.4), 'other'),
      chunk(20, 2, null, null),
    ]);
});

describe('createPgMapStore', () => {
  it('returns the vectors one model embedded, ordered by id', async () => {
    // An update rewrites chunk 1 at the end of the heap, so an unordered scan returns it last.
    await db.update(chunks).set({ text: 'edited' }).where(eq(chunks.id, 1));
    const vectors = await store.embeddedVectors('bge');
    expect(vectors.map((v) => v.id)).toEqual([1, 2, 3]);
    expect(vectors[2]!.embedding).toEqual(vector(0.3));
  });

  it('has no stored version before the first projection', async () => {
    expect(await store.storedVersion()).toBeUndefined();
  });

  it('replaces every point and the version', async () => {
    await store.replace('v1', [
      { chunkId: 1, x: 1, y: 1 },
      { chunkId: 2, x: 2, y: 2 },
    ]);
    await store.replace('v2', [{ chunkId: 3, x: 3, y: -3 }]);
    expect(await store.storedVersion()).toBe('v2');
    expect((await store.points()).map((p) => p.chunkId)).toEqual([3]);
  });

  it('keeps the old points when a replacement fails', async () => {
    await store.replace('v1', [{ chunkId: 1, x: 1, y: 1 }]);
    // Chunk 99 doesn't exist, so the foreign key rejects the insert after the delete ran.
    await expect(store.replace('v2', [{ chunkId: 99, x: 0, y: 0 }])).rejects.toThrow();
    expect(await store.storedVersion()).toBe('v1');
    expect((await store.points()).map((p) => p.chunkId)).toEqual([1]);
  });

  it('joins each point to its post and counts distinct retrieval runs per post', async () => {
    const [a, b] = await db
      .insert(retrievalRuns)
      .values([{ weekStart: '2026-10-26' }, { weekStart: '2026-10-26' }])
      .returning();
    const row = (runId: string, chunkId: number | null) => ({
      runId,
      chunkId,
      postId: 10,
      query: 'help',
      rank: 1,
      score: 0.5,
    });
    // Post 10: run a twice (two queries), run b once with a dropped chunk; two distinct runs.
    await db.insert(retrievals).values([row(a!.id, 1), row(a!.id, 2), row(b!.id, null)]);
    await store.replace('v1', [
      { chunkId: 1, x: 1.5, y: -2.5 },
      { chunkId: 2, x: 2, y: 2 },
      { chunkId: 3, x: 3, y: 3 },
    ]);
    expect(await store.points()).toEqual([
      {
        chunkId: 1,
        postId: 10,
        x: 1.5,
        y: -2.5,
        weekStart: '2026-10-26',
        topicTitle: 'darktable 5.4',
        postNumber: 1,
        url: 'https://forum.test/t/1/1',
        runs: 2,
      },
      expect.objectContaining({ chunkId: 2, postId: 10, runs: 2 }),
      expect.objectContaining({ chunkId: 3, postId: 20, postNumber: 2, runs: 0 }),
    ]);
  });

  it('formats weeks as ISO dates whatever the session DateStyle', async () => {
    await store.replace('v1', [{ chunkId: 1, x: 0, y: 0 }]);
    const points = await db.transaction(async (tx) => {
      await tx.execute(sql`set local datestyle = 'SQL, DMY'`);
      return createPgMapStore(tx as unknown as typeof db).points();
    });
    expect(points[0]!.weekStart).toBe('2026-10-26');
  });
});
