import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { posts, topics } from '../db/schema';
import { createPgCorpus } from './pg-corpus';

const { pool, db } = connect(process.env.DATABASE_URL!);

beforeAll(() => runMigrations(db));
afterAll(() => pool.end());

const post = (id: number, createdAt: string) => ({
  id,
  topicId: 1,
  postNumber: id,
  username: 'u',
  raw: 'r',
  createdAt: new Date(createdAt),
  url: `https://forum.test/p/${id}`,
});

describe('Postgres corpus', () => {
  beforeEach(async () => {
    await db.execute(sql`truncate topics, posts restart identity cascade`);
    await db.insert(topics).values({
      id: 1,
      title: 't',
      category: 'c',
      url: 'https://forum.test/t/1',
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
    await db
      .insert(posts)
      .values([
        post(1, '2026-10-26T00:10:00Z'),
        post(2, '2026-11-01T23:30:00Z'),
        post(3, '2026-10-25T23:59:00Z'),
      ]);
  });

  it('maps each known post to the Monday of its UTC week, and skips unknown ids', async () => {
    const weeks = await createPgCorpus(db).postWeeks([1, 2, 3, 999]);
    expect(weeks).toEqual(
      new Map([
        [1, '2026-10-26'],
        [2, '2026-10-26'],
        [3, '2026-10-19'],
      ]),
    );
  });

  it('uses UTC weeks even when the session runs in another timezone', async () => {
    const weeks = await db.transaction(async (tx) => {
      // Auckland is UTC+13 here: post 3 (Sunday 23:59 UTC) is Monday morning locally.
      await tx.execute(sql`set local timezone = 'Pacific/Auckland'`);
      return createPgCorpus(tx as unknown as typeof db).postWeeks([3]);
    });
    expect(weeks.get(3)).toBe('2026-10-19');
  });

  it('answers an empty list without a query', async () => {
    expect(await createPgCorpus(db).postWeeks([])).toEqual(new Map());
  });
});
