import type { z } from 'zod';
import { type ForumSource, RequestCapReached, type TopicActivity } from '../forum-source';
import { LatestSchema } from './schemas';

export interface DiscourseSourceOptions {
  baseUrl: string;
  userAgent: string;
  /** Wait between requests; 600 ms is 100/min, half of Discourse's default per-IP limit. */
  minIntervalMs: number;
  maxRequests: number;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
}

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

  const get = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
    if (requestCount >= maxRequests) throw new RequestCapReached(maxRequests);
    if (requestCount > 0) await sleep(minIntervalMs);
    requestCount++;
    const res = await fetch(new URL(path, baseUrl), { headers: { 'User-Agent': userAgent } });
    if (!res.ok) throw new Error(`Discourse ${res.status} for ${path}`);
    return schema.parse(await res.json());
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

  return { listActiveTopics };
};
