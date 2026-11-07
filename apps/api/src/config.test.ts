import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults for a local run', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      databaseUrl: 'postgres://cv:cv@localhost:5433/community_voices',
      anthropicApiKey: undefined,
      webDistDir: undefined,
      ingest: {
        discourseBaseUrl: 'https://discuss.pixls.us',
        userAgent: expect.stringMatching(/^community-voices\//),
        minIntervalMs: 600,
        maxRequests: 1500,
        maxTokens: 1_500_000,
        historyWeeks: 3,
        chunk: { maxWords: 300, overlapWords: 40, minWords: 15 },
      },
      embedding: {
        model: 'Xenova/bge-small-en-v1.5',
        dtype: 'q8',
        batchSize: 32,
        queryPrefix: 'Represent this sentence for searching relevant passages: ',
        cacheDir: undefined,
        allowRemoteModels: true,
      },
    });
  });

  it('reads overrides from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      DATABASE_URL: 'postgres://u:p@db:5432/x',
      ANTHROPIC_API_KEY: 'sk-test',
      WEB_DIST_DIR: '/app/web',
      DISCOURSE_BASE_URL: 'https://forum.example.org',
      INGEST_MAX_REQUESTS: '20',
      INGEST_MAX_TOKENS: '5000',
      EMBEDDING_MODEL: 'Xenova/other',
      EMBEDDING_BATCH_SIZE: '8',
      EMBEDDING_CACHE_DIR: '/models',
      EMBEDDING_ALLOW_REMOTE: 'false',
    });
    expect(config).toMatchObject({
      port: 8080,
      databaseUrl: 'postgres://u:p@db:5432/x',
      anthropicApiKey: 'sk-test',
      webDistDir: '/app/web',
      ingest: { discourseBaseUrl: 'https://forum.example.org', maxRequests: 20, maxTokens: 5000 },
      embedding: {
        model: 'Xenova/other',
        batchSize: 8,
        cacheDir: '/models',
        allowRemoteModels: false,
      },
    });
  });

  it('treats an empty API key as missing', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: '' }).anthropicApiKey).toBeUndefined();
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
