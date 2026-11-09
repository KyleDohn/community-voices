import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { posts, topics } from '../db/schema';
import { createPgPostMedia } from './pg-post-media';

const { pool, db } = connect(process.env.DATABASE_URL!);
const media = createPgPostMedia(db);
const createdAt = new Date('2026-10-27T12:00:00Z');
const image = {
  url: 'https://cdn.example/a_2_690x455.jpeg',
  alt: 'frame13',
  width: 690,
  height: 455,
  dominantColor: '#756A55',
};

beforeAll(() => runMigrations(db));
afterAll(() => pool.end());
beforeEach(async () => {
  await db.execute(sql`truncate topics, posts cascade`);
  await db.insert(topics).values({ id: 1, title: 't', category: 'c', url: 'u', createdAt });
  await db.insert(posts).values([
    {
      id: 10,
      topicId: 1,
      postNumber: 1,
      username: 'pictured',
      raw: 'r',
      images: [image],
      createdAt,
      url: 'u/1',
    },
    { id: 11, topicId: 1, postNumber: 2, username: 'plain', raw: 'r', createdAt, url: 'u/2' },
    { id: 12, topicId: 1, postNumber: 3, username: 'unasked', raw: 'r', createdAt, url: 'u/3' },
  ]);
});

describe('pg post media', () => {
  it('returns author and images for the stored ids, skipping unknown ones', async () => {
    expect(await media([11, 10, 999])).toEqual([
      { postId: 10, username: 'pictured', images: [image] },
      { postId: 11, username: 'plain', images: [] },
    ]);
  });
});
