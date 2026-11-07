import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { type ChunkOptions, chunkTopic } from '../ingest/chunk';
import type { TimeWindow } from '../ingest/forum-source';
import type { IngestionRepository } from '../ingest/ingestion-run';

const IsoDateTime = z.iso.datetime().transform((s) => new Date(s));

const SeedFileSchema = z.object({
  source: z.string(),
  license: z.string(),
  attribution: z.string(),
  window: z.object({ start: IsoDateTime, end: IsoDateTime }),
  exportedAt: IsoDateTime,
  topics: z.array(
    z.object({ id: z.number(), title: z.string(), category: z.string(), url: z.string(), createdAt: IsoDateTime }),
  ),
  posts: z.array(
    z.object({
      id: z.number(),
      topicId: z.number(),
      postNumber: z.number(),
      username: z.string(),
      raw: z.string(),
      createdAt: IsoDateTime,
      url: z.string(),
    }),
  ),
});

export interface SeedMeta {
  baseUrl: string;
  license: string;
  window: TimeWindow;
}

/** The stored corpus as a committable file. Raw posts only: chunks are rebuilt on load. */
export const exportSeed = async (repo: IngestionRepository, { baseUrl, license, window }: SeedMeta) => ({
  source: baseUrl,
  license,
  attribution: `Posts by the ${new URL(baseUrl).host} community; each post's author is its username.`,
  window,
  exportedAt: new Date(),
  ...(await repo.exportCorpus()),
});

export const loadSeed = async (data: unknown, repo: IngestionRepository, chunkOptions: ChunkOptions) => {
  const parsed = SeedFileSchema.safeParse(data);
  if (!parsed.success) throw new Error(`Invalid seed file: ${z.prettifyError(parsed.error)}`);
  const postsByTopic = Map.groupBy(parsed.data.posts, (p) => p.topicId);
  const corpus = parsed.data.topics
    .map((topic) => ({ topic, posts: postsByTopic.get(topic.id) ?? [] }))
    .filter(({ posts }) => posts.length > 0)
    .map(({ topic, posts }) => ({ topic, posts, chunks: chunkTopic(topic, posts, chunkOptions) }));
  // One transaction: a half-loaded seed would make seedIfEmpty skip it forever.
  await repo.saveCorpus(corpus);
};

/** Boot-time fallback: a fresh database gets the committed seed, so the demo works offline. */
export const seedIfEmpty = async (repo: IngestionRepository, file: string, chunkOptions: ChunkOptions) => {
  if ((await repo.corpusCounts()).posts > 0) return 'skipped' as const;
  await loadSeed(JSON.parse(await readFile(file, 'utf8')), repo, chunkOptions);
  return 'loaded' as const;
};

/** Repo-level `seed/`; the same relative path in dev and in the Docker image. */
export const SEED_DIR = fileURLToPath(new URL('../../../../seed', import.meta.url));

/** `<host>-<from>-<to>.json`; other files in seed/ (e.g. the sample A/B run) are not corpora. */
const SEED_NAME = /^[a-z0-9]+-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.json$/;

/** Seed files are named by date range, so the last one in sort order is the newest. */
export const latestSeedFile = async (dir = SEED_DIR) => {
  const files = await readdir(dir).catch(() => []);
  const newest = files.filter((f) => SEED_NAME.test(f)).sort().at(-1);
  return newest && join(dir, newest);
};
