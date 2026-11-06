import { z } from 'zod';

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgres://cv:cv@localhost:5433/community_voices'),
  /** Optional at boot: without it the app still serves the committed sample run. */
  ANTHROPIC_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  /** Directory of the built web app; when set, the API serves it at `/`. */
  WEB_DIST_DIR: z.preprocess(emptyAsUndefined, z.string().optional()),
});

export interface Config {
  port: number;
  databaseUrl: string;
  anthropicApiKey: string | undefined;
  webDistDir: string | undefined;
}

export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  const { PORT, DATABASE_URL, ANTHROPIC_API_KEY, WEB_DIST_DIR } = parsed.data;
  return {
    port: PORT,
    databaseUrl: DATABASE_URL,
    anthropicApiKey: ANTHROPIC_API_KEY,
    webDistDir: WEB_DIST_DIR,
  };
};
