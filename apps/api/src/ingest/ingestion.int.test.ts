import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { RequestCapReached } from './forum-source';
import { createPgIngestionRepository } from './pg-ingestion-repository';
import { createIngestionService } from './ingestion-service';
import { createFakeForumSource, scriptedTopic } from './testing/fake-forum-source';

const { pool, db } = connect(process.env.DATABASE_URL!);
const repo = createPgIngestionRepository(db);
const window = { start: new Date('2026-11-02T00:00:00Z'), end: new Date('2026-11-09T00:00:00Z') };
const reply =
  'Switching the output color profile fixed the banding I was seeing after export to JPEG.';
const forum = [
  scriptedTopic(1, [reply, reply]),
  scriptedTopic(2, [reply]),
  scriptedTopic(3, [reply]),
];
const chunkOptions = { maxWords: 300, overlapWords: 40, minWords: 15 };

const serviceWith = (source: ReturnType<typeof createFakeForumSource>['source']) =>
  createIngestionService({ repo, sourceFor: () => source, chunkOptions });

beforeAll(() => runMigrations(db));
beforeEach(() => db.execute(sql`truncate topics, posts, chunks, ingestion_runs cascade`));
afterAll(() => pool.end());

describe('ingestion into Postgres', () => {
  it('stores a run and reads it back with its window and counts', async () => {
    const service = serviceWith(createFakeForumSource(forum).source);
    const { id } = await service.start({ window, maxRequests: 50, maxTokens: 100_000 });

    await service.ingest(id);

    expect(await repo.getRun(id)).toMatchObject({
      status: 'succeeded',
      window,
      doneTopicIds: [1, 2, 3],
      topicsStored: 3,
      postsStored: 7,
      chunksStored: 7,
    });
  });

  it('finds no run for an id that is not a uuid', async () => {
    expect(await repo.getRun('nope')).toBeUndefined();
  });

  it('adds no duplicates when the same window is ingested again', async () => {
    const service = serviceWith(createFakeForumSource(forum).source);
    for (let i = 0; i < 2; i++) {
      const { id } = await service.start({ window, maxRequests: 50, maxTokens: 100_000 });
      expect((await service.ingest(id)).status).toBe('succeeded');
    }

    expect(await repo.corpusCounts()).toEqual({ topics: 3, posts: 7, chunks: 7 });
  });

  it('resumes a capped run from its cursor without refetching finished topics', async () => {
    const capped = createFakeForumSource(forum, new Map([[2, new RequestCapReached(5)]]));
    const { id } = await serviceWith(capped.source).start({
      window,
      maxRequests: 5,
      maxTokens: 100_000,
    });
    expect(await serviceWith(capped.source).ingest(id)).toMatchObject({
      status: 'capped',
      doneTopicIds: [1],
    });

    const healthy = createFakeForumSource(forum);
    const resumed = await serviceWith(healthy.source).ingest(id);

    expect(healthy.fetched).toEqual([2, 3]);
    expect(resumed).toMatchObject({ status: 'succeeded', doneTopicIds: [1, 2, 3], postsStored: 7 });
    expect(await repo.corpusCounts()).toEqual({ topics: 3, posts: 7, chunks: 7 });
  });
});
