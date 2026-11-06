import { describe, expect, it } from 'vitest';
import { RequestCapReached } from '../forum-source';
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

const novemberWeek = {
  start: new Date('2026-11-02T00:00:00Z'),
  end: new Date('2026-11-09T00:00:00Z'),
};

describe('DiscourseSource.fetchTopic', () => {
  it('returns the topic with its full category name and raw post text', async () => {
    const { source } = setup();

    const { topic, posts } = await source.fetchTopic(62066, novemberWeek);

    expect(topic).toEqual({
      id: 62066,
      title: "Hawai'ian Ferns - Hilo, HI - USA",
      category: 'Processing / Play Raw',
      url: 'https://discuss.pixls.us/t/hawaiian-ferns-hilo-hi-usa/62066',
      createdAt: expect.any(Date),
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      id: 465364,
      topicId: 62066,
      postNumber: 1,
      username: 'LaurentFromSF',
      createdAt: new Date('2026-11-06T23:14:01.951Z'),
      url: 'https://discuss.pixls.us/t/hawaiian-ferns-hilo-hi-usa/62066/1',
    });
    expect(posts[0]?.raw.length).toBeGreaterThan(0);
  });

  it('reads a long topic from its tail and stops at the first batch older than the window', async () => {
    const { source, requests } = setup();

    const { posts } = await source.fetchTopic(60539, novemberWeek);

    expect(posts.map((p) => p.postNumber)).toEqual([43, 44, 45, 46, 47, 48, 49]);
    expect(requests.filter((r) => r.startsWith('/t/60539/posts.json'))).toHaveLength(1);
  });

  it('keeps paging back while batches are still inside the window', async () => {
    const { source, requests } = setup();

    const { posts } = await source.fetchTopic(60539, {
      start: new Date('2026-09-01T00:00:00Z'),
      end: novemberWeek.end,
    });

    expect(posts).toHaveLength(49);
    expect(requests.filter((r) => r.startsWith('/t/60539/posts.json'))).toHaveLength(2);
  });

  it('drops moderator and small-action posts', async () => {
    const { default: short } = await import('./__fixtures__/topic-62066.json');
    const [original] = short.post_stream.posts;
    const smallAction = { ...original!, id: 1, post_number: 2, post_type: 3, raw: 'closed' };
    const withAction = {
      ...short,
      post_stream: { posts: [original, smallAction], stream: [original!.id, 1] },
    };
    const { source } = setup({ overrides: { '/t/62066.json': withAction } });

    const { posts } = await source.fetchTopic(62066, novemberWeek);

    expect(posts.map((p) => p.postNumber)).toEqual([1]);
  });

  it('drops posts the community flagged and hid, which come without raw text', async () => {
    const { default: short } = await import('./__fixtures__/topic-62066.json');
    const [original] = short.post_stream.posts;
    // JSON drops the undefined key, so this arrives without `raw`, like a real hidden post.
    const hidden = { ...original!, id: 2, post_number: 2, hidden: true, raw: undefined };
    const withHidden = {
      ...short,
      post_stream: { posts: [original, hidden], stream: [original!.id, 2] },
    };
    const { source } = setup({ overrides: { '/t/62066.json': withHidden } });

    const { posts } = await source.fetchTopic(62066, novemberWeek);

    expect(posts.map((p) => p.postNumber)).toEqual([1]);
  });

  it('names the URL when a response does not match the expected shape', async () => {
    const { source } = setup({ overrides: { '/t/62066.json': { id: 62066 } } });

    await expect(source.fetchTopic(62066, novemberWeek)).rejects.toThrow(/\/t\/62066\.json/);
  });

  it('loads category names once per source', async () => {
    const { source, requests } = setup();

    await source.fetchTopic(62066, novemberWeek);
    await source.fetchTopic(60539, novemberWeek);

    expect(requests.filter((r) => r === '/site.json')).toHaveLength(1);
  });
});

describe('DiscourseSource politeness', () => {
  it('waits the minimum interval before every request after the first', async () => {
    const { source, requests, sleeps } = setup();

    await source.fetchTopic(60539, novemberWeek);

    expect(requests).toHaveLength(3);
    expect(sleeps).toEqual([600, 600]);
  });

  it('throws RequestCapReached instead of exceeding the request cap', async () => {
    const { source, requests } = setup({ maxRequests: 2 });

    await expect(source.fetchTopic(60539, novemberWeek)).rejects.toBeInstanceOf(RequestCapReached);
    expect(requests).toHaveLength(2);
  });
});
