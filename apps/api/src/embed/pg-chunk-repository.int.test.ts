import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { createPgIngestionRepository } from '../ingest/pg-ingestion-repository';
import { embedPendingChunks } from './embed-pending';
import { createPgChunkRepository } from './pg-chunk-repository';
import { fakeEmbedder } from './testing/fake-embedder';
import { seedChunks } from './testing/seed-chunks';

const { pool, db } = connect(process.env.DATABASE_URL!);
const ingestion = createPgIngestionRepository(db);
const chunks = createPgChunkRepository(db);
const week = '2026-11-02';

beforeAll(() => runMigrations(db));
beforeEach(() => db.execute(sql`truncate topics, posts, chunks, ingestion_runs cascade`));
afterAll(() => pool.end());

describe('pg chunk repository: embeddings', () => {
  it('lists unembedded chunks in id order, up to the limit', async () => {
    await seedChunks(ingestion, [
      { text: 'first', week },
      { text: 'second', week },
      { text: 'third', week },
    ]);

    const pending = await chunks.pendingChunks('m', 2);

    expect(pending.map((c) => c.text)).toEqual(['first', 'second']);
  });

  it('has nothing pending once every chunk is embedded, until the model changes', async () => {
    await seedChunks(ingestion, [
      { text: 'first', week },
      { text: 'second', week },
      { text: 'third', week },
    ]);

    expect(await embedPendingChunks(chunks, fakeEmbedder('m1'), { batchSize: 2 })).toEqual({
      embedded: 3,
    });
    expect(await chunks.pendingChunks('m1', 10)).toEqual([]);
    expect(await chunks.pendingChunks('m2', 10)).toHaveLength(3);
  });
});
