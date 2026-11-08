import { CostStatsResponse, ErrorResponse, RetrievalStatsResponse } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { StatsSource } from './stats';
import { testDependencies } from './testing/test-dependencies';

const retrieved: RetrievalStatsResponse = {
  totalRuns: 7,
  posts: [
    {
      postId: 463229,
      topicTitle: 'darktable 5.4',
      postNumber: 8,
      url: 'https://forum.test/p/463229',
      weekStart: '2026-10-26',
      runs: 7,
      facetHits: 9,
      trendHits: 6,
      lastRetrievedAt: '2026-11-08T10:00:00.000Z',
    },
  ],
};

const costs: CostStatsResponse = {
  runs: [
    {
      kind: 'ab',
      id: 'ab-1',
      weekStart: '2026-10-26',
      status: 'succeeded',
      isSample: true,
      costUsd: 0.29,
      createdAt: '2026-11-08T10:00:00.000Z',
    },
  ],
  totalUsd: 0.29,
};

const appWith = (limits: number[] = []) => {
  const stats: StatsSource = {
    retrievals: async (limit) => {
      limits.push(limit);
      return retrieved;
    },
    costs: async () => costs,
  };
  return createApp(testDependencies({ stats }));
};

describe('GET /api/v1/stats/retrievals', () => {
  it('returns the most-retrieved posts, 20 by default', async () => {
    const limits: number[] = [];
    const res = await appWith(limits).request('/api/v1/stats/retrievals');
    expect(res.status).toBe(200);
    expect(RetrievalStatsResponse.parse(await res.json())).toEqual(retrieved);
    expect(limits).toEqual([20]);
  });

  it('passes a limit from 1 to 100 through', async () => {
    const limits: number[] = [];
    const app = appWith(limits);
    await app.request('/api/v1/stats/retrievals?limit=1');
    await app.request('/api/v1/stats/retrievals?limit=100');
    expect(limits).toEqual([1, 100]);
  });

  it.each(['0', '101', '2.5', 'ten', ''])('rejects limit=%s with 400', async (limit) => {
    const limits: number[] = [];
    const res = await appWith(limits).request(`/api/v1/stats/retrievals?limit=${limit}`);
    expect(res.status).toBe(400);
    expect(ErrorResponse.parse(await res.json()).error).toBe('invalid_request');
    expect(limits).toEqual([]);
  });
});

describe('GET /api/v1/stats/costs', () => {
  it('returns every paid run and the total', async () => {
    const res = await appWith().request('/api/v1/stats/costs');
    expect(res.status).toBe(200);
    expect(CostStatsResponse.parse(await res.json())).toEqual(costs);
  });
});
