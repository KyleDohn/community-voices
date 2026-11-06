import { describe, expect, it } from 'vitest';
import { RequestCapReached } from './forum-source';
import { createIngestionService } from './ingestion-service';
import {
  createFakeForumSource,
  type ScriptedTopic,
  scriptedTopic,
} from './testing/fake-forum-source';
import { createMemoryIngestionRepository } from './testing/memory-ingestion-repository';

const window = { start: new Date('2026-11-02T00:00:00Z'), end: new Date('2026-11-09T00:00:00Z') };
const usefulReply =
  'I had the same banding on export until I switched the output profile to linear Rec2020.';

const setup = (topics: ScriptedTopic[], failOn?: Map<number, Error>) => {
  const forum = createFakeForumSource(topics, failOn);
  const memory = createMemoryIngestionRepository();
  const service = createIngestionService({
    repo: memory.repo,
    sourceFor: () => forum.source,
    chunkOptions: { maxWords: 300, overlapWords: 40, minWords: 15 },
  });
  const start = (maxTokens = 1_000_000) => service.start({ window, maxRequests: 100, maxTokens });
  return { service, start, forum, memory };
};

describe('IngestionService', () => {
  it('stores every active topic with its posts and chunks', async () => {
    const { service, start, memory } = setup([
      scriptedTopic(1, [usefulReply, 'Thanks!']),
      scriptedTopic(2, [usefulReply]),
    ]);

    const run = await service.ingest((await start()).id);

    expect(run).toMatchObject({
      status: 'succeeded',
      topicsStored: 2,
      postsStored: 5,
      chunksStored: 4,
    });
    expect(run.doneTopicIds).toEqual([1, 2]);
    expect([...memory.chunks.values()][0]?.weekStart).toEqual(window.start);
  });

  it('skips topics with no posts inside the window', async () => {
    const { service, start, memory } = setup([scriptedTopic(1, [], '2026-11-10T08:00:00Z')]);

    const run = await service.ingest((await start()).id);

    expect(run).toMatchObject({ status: 'succeeded', topicsStored: 0, doneTopicIds: [1] });
    expect(memory.topics.size).toBe(0);
  });

  it('stops as capped once the token budget is spent, before fetching more topics', async () => {
    const { service, start, forum } = setup([
      scriptedTopic(1, [usefulReply]),
      scriptedTopic(2, [usefulReply]),
    ]);

    const run = await service.ingest((await start(10)).id);

    expect(run).toMatchObject({ status: 'capped', doneTopicIds: [1] });
    expect(forum.fetched).toEqual([1]);
  });

  it('stops as capped when the source runs out of requests, keeping finished topics', async () => {
    const { service, start } = setup(
      [scriptedTopic(1, [usefulReply]), scriptedTopic(2, [usefulReply])],
      new Map([[2, new RequestCapReached(100)]]),
    );

    const run = await service.ingest((await start()).id);

    expect(run).toMatchObject({ status: 'capped', doneTopicIds: [1], topicsStored: 1 });
  });

  it('records other errors as a failed run', async () => {
    const { service, start } = setup(
      [scriptedTopic(1, [])],
      new Map([[1, new Error('Discourse 502')]]),
    );

    const run = await service.ingest((await start()).id);

    expect(run).toMatchObject({ status: 'failed', error: 'Discourse 502' });
  });
});
