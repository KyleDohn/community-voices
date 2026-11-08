import { describe, expect, it } from 'vitest';
import { createMemoryChunkSearch, scriptedEmbedder } from './testing/memory-chunk-search';
import { trendLookup } from './trend-lookup';

const week = '2026-10-26';
const priorWeeks = ['2026-10-19', '2026-10-12'];
const embedder = scriptedEmbedder({ 'export crash': [1, 0] });

// Close to the theme: [1, 0.1]; far from it: [0, 1].
const search = createMemoryChunkSearch([
  { chunkId: 1, week, vector: [1, 0.1] },
  { chunkId: 2, week, vector: [1, 0.2] },
  { chunkId: 3, week, vector: [1, 0.3] },
  { chunkId: 4, week: '2026-10-19', vector: [1, 0.15] },
  { chunkId: 5, week: '2026-10-19', vector: [0, 1] },
  { chunkId: 6, week: '2026-10-12', vector: [0, 1] },
]);

describe('trendLookup', () => {
  it("counts each week's share of the chunks closest to the theme across all weeks", async () => {
    const [trend] = await trendLookup(
      { embedder, search },
      { week, priorWeeks, themes: ['export crash'], poolSize: 4, examplesPerWeek: 2 },
    );

    expect(trend!.theme).toBe('export crash');
    expect(trend!.weeks.map((w) => [w.weekStart, w.matches])).toEqual([
      ['2026-10-26', 3],
      ['2026-10-19', 1],
      ['2026-10-12', 0],
    ]);
  });

  it("gives each week's closest pooled matches as examples, up to examplesPerWeek", async () => {
    const [trend] = await trendLookup(
      { embedder, search },
      { week, priorWeeks, themes: ['export crash'], poolSize: 4, examplesPerWeek: 2 },
    );

    expect(trend!.weeks.map((w) => w.examples.map((e) => e.chunkId))).toEqual([[1, 2], [4], []]);
  });

  it('pools the nearest chunks across weeks, not the first weeks listed', async () => {
    const pooled = createMemoryChunkSearch([
      { chunkId: 1, week, vector: [1, 0.1] },
      { chunkId: 2, week, vector: [1, 0.5] },
      { chunkId: 3, week: '2026-10-19', vector: [1, 0.2] },
    ]);

    const [trend] = await trendLookup(
      { embedder, search: pooled },
      { week, priorWeeks, themes: ['export crash'], poolSize: 2, examplesPerWeek: 2 },
    );

    expect(trend!.weeks.map((w) => w.matches)).toEqual([1, 1, 0]);
  });

  it('counts a week once even when it is listed twice', async () => {
    const [trend] = await trendLookup(
      { embedder, search },
      {
        week,
        priorWeeks: [week, '2026-10-19'],
        themes: ['export crash'],
        poolSize: 4,
        examplesPerWeek: 1,
      },
    );

    expect(trend!.weeks.map((w) => [w.weekStart, w.matches])).toEqual([
      ['2026-10-26', 3],
      ['2026-10-19', 1],
    ]);
  });

  it('breaks an exact tie on chunk id, not on which week is listed first', async () => {
    const tied = createMemoryChunkSearch([
      { chunkId: 2, week, vector: [1, 0.1] },
      { chunkId: 1, week: '2026-10-19', vector: [1, 0.1] },
    ]);

    const [trend] = await trendLookup(
      { embedder, search: tied },
      { week, priorWeeks, themes: ['export crash'], poolSize: 1, examplesPerWeek: 1 },
    );

    expect(trend!.weeks.map((w) => w.matches)).toEqual([0, 1, 0]);
  });
});
