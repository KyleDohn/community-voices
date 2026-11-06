/**
 * Re-records the trimmed pixls fixtures used by the DiscourseSource unit tests.
 * Run from apps/api: `pnpm tsx scripts/record-discourse-fixtures.ts`. Makes about 8 paced requests.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import {
  LatestSchema,
  SiteSchema,
  TopicPostsSchema,
  TopicSchema,
} from '../src/ingest/discourse/schemas';

const BASE = 'https://discuss.pixls.us';
const USER_AGENT = 'community-voices/0.1 (non-commercial take-home demo; fixture recorder)';
const OUT = join(import.meta.dirname, '../src/ingest/discourse/__fixtures__');
const LONG_TOPIC = 60539;
const SHORT_TOPIC = 62066;

const get = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
  await new Promise((r) => setTimeout(r, 1000));
  const res = await fetch(BASE + path, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return schema.parse(await res.json());
};

const save = (name: string, data: unknown) =>
  writeFile(join(OUT, name), JSON.stringify(data, null, 2) + '\n');

await mkdir(OUT, { recursive: true });
await save('site.json', await get('/site.json', SiteSchema));
for (const page of [0, 1]) {
  await save(
    `latest-page-${page}.json`,
    await get(`/latest.json?order=activity&page=${page}`, LatestSchema),
  );
}
for (const id of [LONG_TOPIC, SHORT_TOPIC]) {
  const topic = await get(`/t/${id}.json?include_raw=true`, TopicSchema);
  await save(`topic-${id}.json`, topic);
  const inline = new Set(topic.post_stream.posts.map((p) => p.id));
  const rest = topic.post_stream.stream.filter((postId) => !inline.has(postId));
  if (rest.length === 0) continue;
  const query = rest.map((postId) => `post_ids[]=${postId}`).join('&');
  // One file holds every non-inline post. The test fake serves any requested subset of it.
  await save(
    `topic-${id}-posts.json`,
    await get(`/t/${id}/posts.json?include_raw=true&${query}`, TopicPostsSchema),
  );
}
console.log(`Fixtures written to ${OUT}`);
