import { and, count, eq, gte, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { chunks, ingestionRuns, posts, topics } from '../db/schema';
import type { IngestionRepository, IngestionRun } from './ingestion-run';

type RunRow = typeof ingestionRuns.$inferSelect;

const toRun = (row: RunRow): IngestionRun => ({
  id: row.id,
  status: row.status,
  window: { start: row.windowStart, end: row.windowEnd },
  maxRequests: row.maxRequests,
  maxTokens: row.maxTokens,
  doneTopicIds: row.doneTopicIds,
  topicsStored: row.topicsStored,
  postsStored: row.postsStored,
  chunksStored: row.chunksStored,
  tokensUsed: row.tokensUsed,
  error: row.error,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `YYYY-MM-DD` in UTC; node-pg would read a Date for a `date` column in local time. */
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const createPgIngestionRepository = (db: Database): IngestionRepository => ({
  createRun: async ({ window, maxRequests, maxTokens }) => {
    const [row] = await db
      .insert(ingestionRuns)
      .values({
        status: 'queued',
        windowStart: window.start,
        windowEnd: window.end,
        maxRequests,
        maxTokens,
      })
      .returning();
    return toRun(row!);
  },

  getRun: async (id) => {
    if (!UUID.test(id)) return undefined;
    const [row] = await db.select().from(ingestionRuns).where(eq(ingestionRuns.id, id));
    return row && toRun(row);
  },

  updateRun: async (id, progress) => {
    await db
      .update(ingestionRuns)
      .set({ ...progress, updatedAt: new Date() })
      .where(eq(ingestionRuns.id, id));
  },

  saveTopic: (topic, topicPosts, topicChunks) =>
    db.transaction(async (tx) => {
      const { title, category, url } = topic;
      await tx
        .insert(topics)
        .values(topic)
        .onConflictDoUpdate({ target: topics.id, set: { title, category, url } });
      await tx
        .insert(posts)
        .values(topicPosts)
        .onConflictDoUpdate({
          target: posts.id,
          set: { raw: sql`excluded.raw`, username: sql`excluded.username`, url: sql`excluded.url` },
        });
      if (topicChunks.length > 0) {
        await tx
          .insert(chunks)
          .values(topicChunks.map((c) => ({ ...c, weekStart: isoDate(c.weekStart) })))
          .onConflictDoUpdate({
            target: [chunks.postId, chunks.chunkIndex],
            set: {
              text: sql`excluded.text`,
              weekStart: sql`excluded.week_start`,
              // Keep the embedding only when the text it was computed from is unchanged.
              embedding: sql`case when ${chunks.text} = excluded.text then ${chunks.embedding} end`,
              embeddingModel: sql`case when ${chunks.text} = excluded.text then ${chunks.embeddingModel} end`,
            },
          });
      }
      // An edited post can shrink, so drop chunk indexes it no longer produces.
      for (const post of topicPosts) {
        const kept = topicChunks.filter((c) => c.postId === post.id).length;
        await tx
          .delete(chunks)
          .where(and(eq(chunks.postId, post.id), gte(chunks.chunkIndex, kept)));
      }
    }),

  corpusCounts: async () => {
    const [[t], [p], [c]] = await Promise.all([
      db.select({ n: count() }).from(topics),
      db.select({ n: count() }).from(posts),
      db.select({ n: count() }).from(chunks),
    ]);
    return { topics: t!.n, posts: p!.n, chunks: c!.n };
  },
});
