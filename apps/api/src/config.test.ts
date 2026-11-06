import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults for a local run', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      databaseUrl: 'postgres://cv:cv@localhost:5433/community_voices',
      anthropicApiKey: undefined,
      webDistDir: undefined,
    });
  });

  it('reads overrides from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      DATABASE_URL: 'postgres://u:p@db:5432/x',
      ANTHROPIC_API_KEY: 'sk-test',
      WEB_DIST_DIR: '/app/web',
    });
    expect(config).toMatchObject({
      port: 8080,
      databaseUrl: 'postgres://u:p@db:5432/x',
      anthropicApiKey: 'sk-test',
      webDistDir: '/app/web',
    });
  });

  it('treats an empty API key as missing', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: '' }).anthropicApiKey).toBeUndefined();
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
