import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { loadBgeEmbedder } from '../embed/bge-embedder';
import { startServer } from './start-server';

// Opt-in (`pnpm test:model`): downloads the bge weights, as `pnpm dev` does on a fresh clone.
describe('startServer', () => {
  it('leaves the global Response alone, so the embedder can download into a cold cache', async () => {
    const server = await startServer(new Hono().fetch, 0);
    try {
      const cacheDir = mkdtempSync(join(tmpdir(), 'cv-model-cache-'));
      const config = loadConfig({ ...process.env, EMBEDDING_CACHE_DIR: cacheDir }).embedding;

      await expect(loadBgeEmbedder(config)).resolves.toMatchObject({ dimensions: 384 });
    } finally {
      server.close();
    }
  });
});
