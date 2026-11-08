import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { abRuns, posts, reports, retrievalRuns, retrievals, topics } from '../db/schema';
import { createPgStatsRepository } from './pg-stats-repository';

const { pool, db } = connect(process.env.DATABASE_URL!);
const repo = createPgStatsRepository(db);
const facetIds = ['help', 'edits'];

beforeAll(() => runMigrations(db));
afterAll(() => pool.end());
beforeEach(() =>
  db.execute(
    sql`truncate topics, posts, retrieval_runs, retrievals, reports, ab_runs restart identity cascade`,
  ),
);

const at = (hour: number) => new Date(Date.UTC(2026, 10, 8, hour));
const runIds = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'];

describe('mostRetrievedPosts', () => {
  beforeEach(async () => {
    await db.insert(topics).values({
      id: 1,
      title: 'darktable 5.4',
      category: 'c',
      url: 'https://forum.test/t/1',
      createdAt: at(0),
    });
    const post = (id: number, createdAt: Date) => ({
      id,
      topicId: 1,
      postNumber: id,
      username: 'u',
      raw: 'r',
      createdAt,
      url: `https://forum.test/p/${id}`,
    });
    // Post 3 is Sunday 23:59 UTC, so its week is the Monday before.
    await db
      .insert(posts)
      .values([
        post(1, new Date('2026-10-27T12:00:00Z')),
        post(2, new Date('2026-10-28T12:00:00Z')),
        post(3, new Date('2026-11-01T23:59:00Z')),
        post(4, new Date('2026-10-20T12:00:00Z')),
      ]);
    const [a, b, c] = await db
      .insert(retrievalRuns)
      .values([
        { weekStart: '2026-10-26', createdAt: at(1) },
        { weekStart: '2026-10-26', createdAt: at(2) },
        { weekStart: '2026-10-26', createdAt: at(3) },
      ])
      .returning();
    const row = (runId: string, postId: number, query: string) => ({
      runId,
      chunkId: null,
      postId,
      query,
      rank: 1,
      score: 0.5,
    });
    await db.insert(retrievals).values([
      // Post 1: two runs, three rows.
      row(a!.id, 1, 'help'),
      row(b!.id, 1, 'help'),
      row(b!.id, 1, 'Users report build failures'),
      // Post 2: one run, four rows; more rows than post 1 but fewer runs.
      row(a!.id, 2, 'help'),
      row(a!.id, 2, 'edits'),
      row(a!.id, 2, 'Users report build failures'),
      row(a!.id, 2, 'Play Raw edits'),
      // Posts 3 and 4: one run and one row each; post 3 was retrieved later.
      row(c!.id, 3, 'edits'),
      row(b!.id, 4, 'help'),
      // Post 9 has no post row any more.
      row(a!.id, 9, 'Play Raw edits'),
    ]);
  });

  it('ranks by distinct runs, then total hits, then the latest retrieval', async () => {
    const { posts: ranked } = await repo.mostRetrievedPosts({ limit: 10, facetIds });
    expect(ranked.map((p) => p.postId)).toEqual([1, 2, 3, 4, 9]);
  });

  it('splits hits into facet picks and trend examples, and counts the runs', async () => {
    const { totalRuns, posts: ranked } = await repo.mostRetrievedPosts({ limit: 10, facetIds });
    expect(totalRuns).toBe(3);
    expect(ranked[0]).toEqual({
      postId: 1,
      topicTitle: 'darktable 5.4',
      postNumber: 1,
      url: 'https://forum.test/p/1',
      weekStart: '2026-10-26',
      runs: 2,
      facetHits: 2,
      trendHits: 1,
      lastRetrievedAt: at(2).toISOString(),
    });
    expect(ranked[1]).toMatchObject({ runs: 1, facetHits: 2, trendHits: 2 });
  });

  it('uses the UTC week of the post', async () => {
    const { posts: ranked } = await repo.mostRetrievedPosts({ limit: 10, facetIds });
    expect(ranked.find((p) => p.postId === 3)?.weekStart).toBe('2026-10-26');
    expect(ranked.find((p) => p.postId === 4)?.weekStart).toBe('2026-10-19');
  });

  it('uses the UTC week even when the session runs in another timezone', async () => {
    const ranked = await db.transaction(async (tx) => {
      // Auckland is UTC+13 here: post 3 (Sunday 23:59 UTC) is Monday morning locally.
      await tx.execute(sql`set local timezone = 'Pacific/Auckland'`);
      const local = createPgStatsRepository(tx as unknown as typeof db);
      return (await local.mostRetrievedPosts({ limit: 10, facetIds })).posts;
    });
    expect(ranked.find((p) => p.postId === 3)?.weekStart).toBe('2026-10-26');
  });

  it('keeps a post whose post row is gone, with no title, url or week', async () => {
    const { posts: ranked } = await repo.mostRetrievedPosts({ limit: 10, facetIds });
    expect(ranked.at(-1)).toMatchObject({
      postId: 9,
      topicTitle: null,
      postNumber: null,
      url: null,
      weekStart: null,
    });
  });

  it('returns at most limit posts', async () => {
    const { posts: ranked } = await repo.mostRetrievedPosts({ limit: 2, facetIds });
    expect(ranked.map((p) => p.postId)).toEqual([1, 2]);
  });
});

describe('runCosts', () => {
  beforeEach(async () => {
    const report = (
      id: string,
      costUsd: number,
      hour: number,
      status: 'succeeded' | 'failed' = 'succeeded',
    ) => ({
      id: runIds[0]!.replace('a', id),
      weekStart: '2026-10-26',
      status,
      costUsd,
      createdAt: at(hour),
    });
    await db
      .insert(reports)
      .values([report('1', 0.05, 1), report('2', 0.06, 2), report('3', 0.01, 5, 'failed')]);
    await db.insert(abRuns).values([
      {
        id: runIds[0]!,
        weekStart: '2026-10-26',
        status: 'succeeded',
        isSample: true,
        reportId: runIds[0]!.replace('a', '2'),
        costUsd: 0.29,
        createdAt: at(3),
      },
      {
        id: runIds[1]!,
        weekStart: '2026-10-19',
        status: 'failed',
        costUsd: 0.1,
        createdAt: at(4),
      },
    ]);
  });

  it('lists A/B runs and the reports no A/B run made, newest first', async () => {
    const { runs } = await repo.runCosts();
    expect(runs.map((r) => [r.kind, r.costUsd])).toEqual([
      ['report', 0.01],
      ['ab', 0.1],
      ['ab', 0.29],
      ['report', 0.05],
    ]);
    expect(runs[2]).toEqual({
      kind: 'ab',
      id: runIds[0],
      weekStart: '2026-10-26',
      status: 'succeeded',
      isSample: true,
      costUsd: 0.29,
      createdAt: at(3).toISOString(),
    });
    expect(runs[1]).toMatchObject({ status: 'failed', isSample: false, weekStart: '2026-10-19' });
  });

  it('totals each dollar once', async () => {
    const { totalUsd } = await repo.runCosts();
    expect(totalUsd).toBeCloseTo(0.45, 9);
  });
});
