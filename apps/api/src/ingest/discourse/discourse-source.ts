import { z } from 'zod';
import {
  type ForumPost,
  type ForumSource,
  type ForumTopic,
  RequestCapReached,
  type TimeWindow,
  type TopicActivity,
} from '../forum-source';
import { isAllowed } from './robots';
import {
  type DiscoursePost,
  LatestSchema,
  SiteSchema,
  TopicPostsSchema,
  TopicSchema,
} from './schemas';

export interface DiscourseSourceOptions {
  baseUrl: string;
  userAgent: string;
  /** Wait between requests; 600 ms is 100/min, half of Discourse's default per-IP limit. */
  minIntervalMs: number;
  maxRequests: number;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
}

const REGULAR_POST = 1;
/** Discourse inlines and pages posts in chunks of 20. */
const POST_BATCH = 20;

/** Regular, visible posts only: hidden ones were flagged by the community and carry no raw text. */
const isStorable = (p: DiscoursePost): p is DiscoursePost & { raw: string } =>
  p.post_type === REGULAR_POST && !p.hidden && p.raw !== undefined;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const createDiscourseSource = ({
  baseUrl,
  userAgent,
  minIntervalMs,
  maxRequests,
  fetch = globalThis.fetch,
  sleep = realSleep,
}: DiscourseSourceOptions): ForumSource => {
  let requestCount = 0;
  let categoryNames: Promise<Map<number, string>> | undefined;

  const request = async (path: string) => {
    if (requestCount >= maxRequests) throw new RequestCapReached(maxRequests);
    if (requestCount > 0) await sleep(minIntervalMs);
    requestCount++;
    return fetch(new URL(path, baseUrl), { headers: { 'User-Agent': userAgent } });
  };

  let robotsTxt: Promise<string> | undefined;
  // A missing robots.txt allows everything; it is fetched once per source, before any API call.
  const loadRobots = async () => {
    const res = await request('/robots.txt');
    return res.ok ? res.text() : '';
  };

  const get = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
    robotsTxt ??= loadRobots();
    if (!isAllowed(await robotsTxt, userAgent, path)) {
      throw new Error(`robots.txt at ${baseUrl} disallows ${path}`);
    }
    const res = await request(path);
    if (!res.ok) throw new Error(`Discourse ${res.status} for ${path}`);
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) {
      throw new Error(
        `Unexpected Discourse response for ${path}: ${z.prettifyError(parsed.error)}`,
      );
    }
    return parsed.data;
  };

  const loadCategoryNames = async () => {
    const { categories } = await get('/site.json', SiteSchema);
    const byId = new Map(categories.map((c) => [c.id, c]));
    return new Map(
      categories.map((c) => {
        const parent = c.parent_category_id ? byId.get(c.parent_category_id) : undefined;
        return [c.id, parent ? `${parent.name} / ${c.name}` : c.name];
      }),
    );
  };

  const listActiveTopics = async (since: Date): Promise<TopicActivity[]> => {
    const active: TopicActivity[] = [];
    for (let page = 0; ; page++) {
      const { topic_list } = await get(`/latest.json?order=activity&page=${page}`, LatestSchema);
      for (const topic of topic_list.topics) {
        const bumpedAt = new Date(topic.bumped_at);
        if (bumpedAt >= since) active.push({ id: topic.id, bumpedAt });
        // Pinned topics sort first regardless of activity, so only an unpinned stale topic ends the list.
        else if (!topic.pinned) return active;
      }
      if (!topic_list.more_topics_url || topic_list.topics.length === 0) return active;
    }
  };

  /** Post IDs rise with time, so walk the stream backwards and stop once a batch predates the window. */
  const fetchTailPosts = async (topicId: number, postIds: number[], since: Date) => {
    const fetched: DiscoursePost[] = [];
    for (let end = postIds.length; end > 0; end -= POST_BATCH) {
      const batch = postIds.slice(Math.max(0, end - POST_BATCH), end);
      const query = batch.map((id) => `post_ids[]=${id}`).join('&');
      const { post_stream } = await get(
        `/t/${topicId}/posts.json?include_raw=true&${query}`,
        TopicPostsSchema,
      );
      fetched.push(...post_stream.posts);
      if (post_stream.posts.some((p) => new Date(p.created_at) < since)) break;
    }
    return fetched;
  };

  const fetchTopic = async (id: number, window: TimeWindow) => {
    categoryNames ??= loadCategoryNames();
    const names = await categoryNames;
    const raw = await get(`/t/${id}.json?include_raw=true`, TopicSchema);
    const inline = raw.post_stream.posts;
    const inlineIds = new Set(inline.map((p) => p.id));
    const rest = raw.post_stream.stream.filter((postId) => !inlineIds.has(postId));
    const tail = await fetchTailPosts(id, rest, window.start);

    const url = `${baseUrl}/t/${raw.slug}/${id}`;
    const topic: ForumTopic = {
      id,
      title: raw.title,
      category: names.get(raw.category_id) ?? 'Uncategorized',
      url,
      createdAt: new Date(raw.created_at),
    };
    const posts: ForumPost[] = [...inline, ...tail]
      .filter(isStorable)
      .map((p) => ({
        id: p.id,
        topicId: id,
        postNumber: p.post_number,
        username: p.username,
        raw: p.raw,
        createdAt: new Date(p.created_at),
        url: `${url}/${p.post_number}`,
      }))
      .filter((p) => p.createdAt >= window.start && p.createdAt < window.end)
      .sort((a, b) => a.postNumber - b.postNumber);
    return { topic, posts };
  };

  return { listActiveTopics, fetchTopic };
};
