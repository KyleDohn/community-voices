import { asc, isNull, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { chunks } from '../db/schema';
import type { EmbeddingStore } from './embedding-store';

const vectorLiteral = (v: number[]) => `[${v.join(',')}]`;

export const createPgChunkRepository = (db: Database): EmbeddingStore => ({
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
});
