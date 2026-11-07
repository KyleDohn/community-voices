import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { createIngestionService } from '../ingest/ingestion-service';
import { createPgIngestionRepository } from '../ingest/pg-ingestion-repository';
import { createFakeForumSource, scriptedTopic } from '../ingest/testing/fake-forum-source';
import { exportSeed, latestSeedFile, loadSeed, seedIfEmpty } from './seed';

const { pool, db } = connect(process.env.DATABASE_URL!);
const repo = createPgIngestionRepository(db);
const chunkOptions = { maxWords: 300, overlapWords: 40, minWords: 15 };
const window = { start: new Date('2026-11-02T00:00:00Z'), end: new Date('2026-11-09T00:00:00Z') };
const reply = 'Switching the output color profile fixed the banding I was seeing after export to JPEG.';
const source = { baseUrl: 'https://forum.test', license: 'CC BY-NC-SA 4.0' };

const truncate = () => db.execute(sql`truncate topics, posts, chunks, ingestion_runs cascade`);
const ingestFakeForum = async () => {
  const forum = createFakeForumSource([scriptedTopic(1, [reply, 'Thanks!']), scriptedTopic(2, [reply])]);
  const service = createIngestionService({ repo, sourceFor: () => forum.source, chunkOptions });
  await service.ingest((await service.start({ window, maxRequests: 50, maxTokens: 100_000 })).id);
};

beforeAll(() => runMigrations(db));
beforeEach(truncate);
afterAll(() => pool.end());

describe('seed', () => {
  it('round-trips the corpus through a seed file into an empty database', async () => {
    await ingestFakeForum();
    const before = await repo.exportCorpus();
    const seed = await exportSeed(repo, { ...source, window });

    await truncate();
    await loadSeed(JSON.parse(JSON.stringify(seed)), repo, chunkOptions);

    expect(await repo.exportCorpus()).toEqual(before);
    expect(await repo.corpusCounts()).toEqual({ topics: 2, posts: 5, chunks: 4 });
  });

  it('loads the seed file at boot only when the database has no posts', async () => {
    await ingestFakeForum();
    const dir = await mkdtemp(join(tmpdir(), 'cv-seed-'));
    const file = join(dir, 'seed.json');
    await writeFile(file, JSON.stringify(await exportSeed(repo, { ...source, window })));

    expect(await seedIfEmpty(repo, file, chunkOptions)).toBe('skipped');
    await truncate();
    expect(await seedIfEmpty(repo, file, chunkOptions)).toBe('loaded');
    expect((await repo.corpusCounts()).posts).toBe(5);
  });

  it('picks the newest corpus file and ignores other JSON in the seed folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-seed-'));
    for (const name of ['pixls-2026-09-07-2026-10-05.json', 'pixls-2026-10-05-2026-11-02.json', 'sample-ab-run.json']) {
      await writeFile(join(dir, name), '{}');
    }

    expect(await latestSeedFile(dir)).toBe(join(dir, 'pixls-2026-10-05-2026-11-02.json'));
  });

  it('loads all or nothing, so a failed load is retried on the next boot', async () => {
    await ingestFakeForum();
    const seed = JSON.parse(JSON.stringify(await exportSeed(repo, { ...source, window })));
    seed.posts.at(-1).raw = 'Postgres rejects a NUL byte: \u0000';
    await truncate();

    await expect(loadSeed(seed, repo, chunkOptions)).rejects.toThrow();

    expect(await repo.corpusCounts()).toEqual({ topics: 0, posts: 0, chunks: 0 });
  });

  it('rejects a seed file that does not match the schema', async () => {
    await expect(loadSeed({ topics: 'nope' }, repo, chunkOptions)).rejects.toThrow(/seed/i);
  });
});
