import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { loadBgeEmbedder } from './bge-embedder';
import { describeEmbedderContract } from './testing/embedder-contract';

// Opt-in (`pnpm test:model`): loads the real weights, so it stays out of the commit hook.
const config = loadConfig(process.env).embedding;
const embedder = loadBgeEmbedder(config);

describeEmbedderContract('bge-small', () => embedder);

const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i]!, 0);

describe('bge-small retrieval', () => {
  it('ranks a post about the query above an unrelated one', async () => {
    const e = await embedder;
    const [crash, walk] = await e.embedDocuments([
      'darktable [Software / darktable]\ndarktable 5.2 crashes every time I export a JPEG to disk.',
      'Sunday photo walk [Community]\nAnyone up for a photo walk by the river this weekend?',
    ]);

    const query = await e.embedQuery('export crash');

    expect(dot(query, crash!)).toBeGreaterThan(dot(query, walk!) + 0.1);
  });
});

describe('loadBgeEmbedder', () => {
  it('refuses a model whose vectors do not fit the chunks column', async () => {
    await expect(loadBgeEmbedder({ ...config, dimensions: 768 })).rejects.toThrow(
      /384.*768|768.*384/,
    );
  });
});
