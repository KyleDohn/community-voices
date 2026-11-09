import { asc, inArray } from 'drizzle-orm';
import type { Database } from '../db/client';
import { posts } from '../db/schema';
import type { PostMediaSource } from '../http/posts';

export const createPgPostMedia =
  (db: Database): PostMediaSource =>
  (ids) =>
    db
      .select({ postId: posts.id, username: posts.username, images: posts.images })
      .from(posts)
      .where(inArray(posts.id, ids))
      .orderBy(asc(posts.id));
