import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostImage } from '@cv/contracts';
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
      // Seeds exported before images were ingested have none.
      images: z.array(PostImage).default([]),
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

const day = (d: Date) => d.toISOString().slice(0, 10);
const hostSlug = (baseUrl: string) => new URL(baseUrl).host.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** `<host>-<from>-<to>.json`, e.g. `discuss-pixls-us-2026-10-05-2026-11-02.json`. */
export const seedFileName = (baseUrl: string, window: TimeWindow) =>
  `${hostSlug(baseUrl)}-${day(window.start)}-${day(window.end)}.json`;

/**
 * The newest seed for this forum. Names sort by date, and other files in seed/ (e.g. the sample
 * A/B run) never match, so they are never loaded as a corpus.
 */
export const latestSeedFile = async (baseUrl: string, dir = SEED_DIR) => {
  const name = new RegExp(`^${hostSlug(baseUrl)}-\\d{4}-\\d{2}-\\d{2}-\\d{4}-\\d{2}-\\d{2}\\.json$`);
  const files = await readdir(dir).catch(() => []);
  const newest = files.filter((f) => name.test(f)).sort().at(-1);
  return newest && join(dir, newest);
};
