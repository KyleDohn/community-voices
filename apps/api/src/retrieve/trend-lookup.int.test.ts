import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { createPgChunkRepository } from '../embed/pg-chunk-repository';
import { unitVector } from '../embed/testing/fake-embedder';
import { seedChunks } from '../embed/testing/seed-chunks';
import { createPgIngestionRepository } from '../ingest/pg-ingestion-repository';
import { scriptedEmbedder } from './testing/memory-chunk-search';
import { trendLookup } from './trend-lookup';

const { pool, db } = connect(process.env.DATABASE_URL!);
const chunks = createPgChunkRepository(db);

/** A 384-d vector with the given leading components. */
const vec = (...head: number[]) => unitVector(Array.from({ length: 384 }, (_, i) => head[i] ?? 0));

beforeAll(() => runMigrations(db));
beforeEach(() =>
  db.execute(sql`truncate topics, posts, chunks, ingestion_runs restart identity cascade`),
);
afterAll(() => pool.end());

describe('trendLookup on pgvector', () => {
  it('counts and shows matches per week from chunks seeded across weeks', async () => {
    await seedChunks(createPgIngestionRepository(db), [
      { text: 'crash, this week', week: '2026-10-26' },
      { text: 'crash again, this week', week: '2026-10-26' },
      { text: 'crash, last week', week: '2026-10-19' },
      { text: 'unrelated, last week', week: '2026-10-19' },
      { text: 'unrelated, two weeks ago', week: '2026-10-12' },
    ]);
    const embedder = scriptedEmbedder({ 'export crash': vec(1, 0) });
    await chunks.saveEmbeddings(embedder.model, [
      { id: 1, embedding: vec(1, 0.1) },
      { id: 2, embedding: vec(1, 0.2) },
      { id: 3, embedding: vec(1, 0.3) },
      { id: 4, embedding: vec(0, 1) },
      { id: 5, embedding: vec(0, 1) },
    ]);

    const [trend] = await trendLookup(
      { embedder, search: chunks },
      {
        week: '2026-10-26',
        priorWeeks: ['2026-10-19', '2026-10-12'],
        themes: ['export crash'],
        poolSize: 3,
        examplesPerWeek: 1,
      },
    );

    expect(
      trend!.weeks.map((w) => [w.weekStart, w.matches, w.examples.map((e) => e.text)]),
    ).toEqual([
      ['2026-10-26', 2, ['crash, this week']],
      ['2026-10-19', 1, ['crash, last week']],
      ['2026-10-12', 0, []],
    ]);
  });
});
