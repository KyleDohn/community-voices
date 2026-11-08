import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { createPgChunkRepository } from '../embed/pg-chunk-repository';
import { vectorOf } from '../embed/testing/fake-embedder';
import { seedChunks } from '../embed/testing/seed-chunks';
import { createPgIngestionRepository } from '../ingest/pg-ingestion-repository';
import { retrieveWeek } from './retrieve-week';
import { scriptedEmbedder } from './testing/memory-chunk-search';

const { pool, db } = connect(process.env.DATABASE_URL!);
const chunks = createPgChunkRepository(db);
const week = '2026-10-26';

beforeAll(() => runMigrations(db));
beforeEach(() =>
  db.execute(sql`truncate topics, posts, chunks, ingestion_runs restart identity cascade`),
);
afterAll(() => pool.end());

describe('retrieveWeek on pgvector', () => {
  it("merges each facet's MMR picks from the target week only", async () => {
    await seedChunks(createPgIngestionRepository(db), [
      { text: 'release', week },
      { text: 'release and help', week },
      { text: 'help', week },
      { text: 'release, prior week', week: '2026-10-19' },
    ]);
    const embedder = scriptedEmbedder({ releases: vectorOf(1, 0, 0), help: vectorOf(0, 0, 1) });
    await chunks.saveEmbeddings(embedder.model, [
      { id: 1, embedding: vectorOf(1, 0, 0) },
      { id: 2, embedding: vectorOf(1, 0, 1) },
      { id: 3, embedding: vectorOf(0, 0, 1) },
      { id: 4, embedding: vectorOf(1, 0, 0) },
    ]);

    const retrieved = await retrieveWeek(
      { embedder, search: chunks },
      {
        week,
        facets: [
          { id: 'releases', label: 'Releases', query: 'releases' },
          { id: 'help', label: 'Help', query: 'help' },
        ],
        candidatesPerFacet: 15,
        keepPerFacet: 2,
        lambda: 0.7,
      },
    );

    expect(retrieved.map((c) => [c.text, c.facets.map((f) => `${f.facetId}#${f.rank}`)])).toEqual([
      ['release', ['releases#1']],
      ['release and help', ['releases#2', 'help#2']],
      ['help', ['help#1']],
    ]);
  });
});
