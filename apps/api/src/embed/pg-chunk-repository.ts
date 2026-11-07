import { and, asc, cosineDistance, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { chunks, posts, topics } from '../db/schema';
import type { ChunkRepository } from './embedding-store';

const vectorLiteral = (v: number[]) => `[${v.join(',')}]`;

export const createPgChunkRepository = (db: Database): ChunkRepository => ({
  pendingChunks: (model, limit) =>
    db
      .select({ id: chunks.id, text: chunks.text })
      .from(chunks)
      .where(or(isNull(chunks.embedding), ne(chunks.embeddingModel, model)))
      .orderBy(asc(chunks.id))
      .limit(limit),

  saveEmbeddings: async (model, rows) => {
    if (rows.length === 0) return;
    // One UPDATE per batch, joined to a VALUES list, instead of a round-trip per chunk.
    const values = rows.map(
      ({ id, embedding }) => sql`(${id}::int, ${vectorLiteral(embedding)}::vector)`,
    );
    await db.execute(sql`
      update ${chunks} set embedding = v.embedding, embedding_model = ${model}
      from (values ${sql.join(values, sql`, `)}) as v(id, embedding)
      where ${chunks.id} = v.id`);
  },

  // Exact scan, no ANN index: at a few thousand rows it takes milliseconds and never misses.
  search: async ({ model, weekStart, vector, k }) => {
    const distance = cosineDistance(chunks.embedding, vector);
    const rows = await db
      .select({
        chunkId: chunks.id,
        postId: chunks.postId,
        topicId: posts.topicId,
        topicTitle: topics.title,
        url: posts.url,
        text: chunks.text,
        distance,
      })
      .from(chunks)
      .innerJoin(posts, eq(posts.id, chunks.postId))
      .innerJoin(topics, eq(topics.id, posts.topicId))
      .where(and(eq(chunks.weekStart, weekStart), eq(chunks.embeddingModel, model)))
      .orderBy(distance)
      .limit(k);
    return rows.map(({ distance, ...hit }) => ({ ...hit, score: 1 - Number(distance) }));
  },
});
