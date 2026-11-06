import { z } from 'zod';
import type { ChunkOptions } from './ingest/chunk';

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

export interface Config {
  port: number;
  databaseUrl: string;
  anthropicApiKey: string | undefined;
  webDistDir: string | undefined;
  ingest: IngestConfig;
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
  };
};
