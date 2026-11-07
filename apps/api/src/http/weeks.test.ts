import { WeeksResponse } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { testDependencies } from './testing/test-dependencies';

describe('GET /api/v1/weeks', () => {
  it('lists the weeks that have chunks, with their counts', async () => {
    const weeks = [
      { weekStart: '2026-11-02', posts: 900, chunks: 850, embedded: 400 },
      { weekStart: '2026-10-26', posts: 1100, chunks: 1000, embedded: 1000 },
    ];
    const app = createApp(testDependencies({ listWeeks: async () => weeks }));

    const res = await app.request('/api/v1/weeks');

    expect(res.status).toBe(200);
    expect(WeeksResponse.parse(await res.json())).toEqual({ weeks });
  });
});
