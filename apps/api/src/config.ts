import { z } from 'zod';
import type { ChunkOptions } from './ingest/chunk';

/** Width of `chunks.embedding`; a model with another width needs a migration, not just config. */
export const EMBEDDING_DIMENSIONS = 384;

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgres://cv:cv@localhost:5433/community_voices'),
  /** Optional at boot: without it the app still serves the committed sample run. */
  ANTHROPIC_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  /** Directory of the built web app; when set, the API serves it at `/`. */
  WEB_DIST_DIR: z.preprocess(emptyAsUndefined, z.string().optional()),
  /** Any public Discourse forum. Check its /tos before pointing elsewhere. */
  DISCOURSE_BASE_URL: z.url().default('https://discuss.pixls.us'),
  /** Four weeks of pixls is about 500 requests; the cap guards against a much bigger forum. */
  INGEST_MAX_REQUESTS: z.coerce.number().int().positive().default(1500),
  /** Four weeks of pixls is about 600k tokens of raw text. */
  INGEST_MAX_TOKENS: z.coerce.number().int().positive().default(1_500_000),
  /** Changing it re-embeds every chunk on the next boot; it must output EMBEDDING_DIMENSIONS. */
  EMBEDDING_MODEL: z.string().default('Xenova/bge-small-en-v1.5'),
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().positive().default(32),
  /** Where model weights are cached; the Docker image bakes them in here. */
  EMBEDDING_CACHE_DIR: z.preprocess(emptyAsUndefined, z.string().optional()),
  /** `false` in the image, so first boot provably needs no network. */
  EMBEDDING_ALLOW_REMOTE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export interface IngestConfig {
  discourseBaseUrl: string;
  userAgent: string;
  minIntervalMs: number;
  maxRequests: number;
  maxTokens: number;
  /** Weeks of trend history before the target week. */
  historyWeeks: number;
  chunk: ChunkOptions;
}

export interface EmbeddingConfig {
  model: string;
  /** 8-bit weights: about 4x smaller and faster on CPU, with little loss in retrieval quality. */
  dtype: 'q8';
  dimensions: number;
  batchSize: number;
  /** bge's instruction for short queries; posts are embedded without it. */
  queryPrefix: string;
  cacheDir: string | undefined;
  allowRemoteModels: boolean;
}

export interface Config {
  port: number;
  databaseUrl: string;
  anthropicApiKey: string | undefined;
  webDistDir: string | undefined;
  ingest: IngestConfig;
  embedding: EmbeddingConfig;
}

export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  const vars = parsed.data;
  return {
    port: vars.PORT,
    databaseUrl: vars.DATABASE_URL,
    anthropicApiKey: vars.ANTHROPIC_API_KEY,
    webDistDir: vars.WEB_DIST_DIR,
    ingest: {
      discourseBaseUrl: vars.DISCOURSE_BASE_URL,
      userAgent: 'community-voices/0.1 (non-commercial take-home demo; weekly community digest)',
      minIntervalMs: 600,
      maxRequests: vars.INGEST_MAX_REQUESTS,
      maxTokens: vars.INGEST_MAX_TOKENS,
      historyWeeks: 3,
      chunk: { maxWords: 300, overlapWords: 40, minWords: 15 },
    },
    embedding: {
      model: vars.EMBEDDING_MODEL,
      dtype: 'q8',
      dimensions: EMBEDDING_DIMENSIONS,
      batchSize: vars.EMBEDDING_BATCH_SIZE,
      queryPrefix: 'Represent this sentence for searching relevant passages: ',
      cacheDir: vars.EMBEDDING_CACHE_DIR,
      allowRemoteModels: vars.EMBEDDING_ALLOW_REMOTE,
    },
  };
};
