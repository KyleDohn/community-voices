import { inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { posts } from '../db/schema';
import type { Corpus } from './run-ab';

/** Reads posts, not chunks, so a real post too short to chunk still counts as real. */
export const createPgCorpus = (db: Database): Corpus => ({
  postWeeks: async (ids) => {
    if (ids.length === 0) return new Map();
    const rows = await db
      .select({
        id: posts.id,
        // date_trunc('week') starts on Monday, matching the week keys.
        week: sql<string>`to_char(date_trunc('week', ${posts.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      })
      .from(posts)
      .where(inArray(posts.id, ids));
    return new Map(rows.map((r) => [r.id, r.week]));
  },
});
