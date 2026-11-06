import { describe, expect, it } from 'vitest';
import { createDiscourseSource } from './discourse-source';
import { createFakeDiscourse } from './fake-discourse';

const setup = (options: { maxRequests?: number; overrides?: Record<string, unknown> } = {}) => {
  const fake = createFakeDiscourse(options.overrides);
  const sleeps: number[] = [];
  const source = createDiscourseSource({
    baseUrl: 'https://discuss.pixls.us',
    userAgent: 'community-voices-test',
    minIntervalMs: 600,
    maxRequests: options.maxRequests ?? 100,
    fetch: fake.fetch,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { source, requests: fake.requests, sleeps };
};

describe('DiscourseSource.listActiveTopics', () => {
  it('pages /latest until a topic was last bumped before the cutoff', async () => {
    const { source, requests } = setup();

    const topics = await source.listActiveTopics(new Date('2026-11-05T00:00:00Z'));

    expect(topics).toHaveLength(49);
    expect(topics[1]).toEqual({ id: 60539, bumpedAt: new Date('2026-11-06T23:42:05.300Z') });
    expect(topics.at(-1)?.id).toBe(61912);
    expect(requests.filter((r) => r.startsWith('/latest.json'))).toHaveLength(2);
  });

  it('keeps recently bumped pinned topics but never stops on stale ones', async () => {
    const { source } = setup();

    const ids = (await source.listActiveTopics(new Date('2026-11-05T00:00:00Z'))).map((t) => t.id);

    expect(ids[0]).toBe(8);
    expect(ids).not.toContain(55179);
    expect(ids).not.toContain(10584);
  });

  it('stops when the forum has no more pages', async () => {
    const lastPage = { topic_list: { topics: [] } };
    const { source, requests } = setup({ overrides: { '/latest.json?page=1': lastPage } });

    const topics = await source.listActiveTopics(new Date('2020-01-01T00:00:00Z'));

    expect(topics).toHaveLength(30);
    expect(requests).toHaveLength(2);
  });
});
