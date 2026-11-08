import { describe, expect, it } from 'vitest';
import { CostStatsResponse, RetrievalStatsResponse } from './stats';

const post = {
  postId: 463229,
  topicTitle: 'darktable 5.4 released',
  url: 'https://discuss.pixls.us/t/darktable-5-4/1/3',
  weekStart: '2026-10-26',
  runs: 7,
  facetHits: 9,
  trendHits: 6,
  lastRetrievedAt: '2026-11-08T10:00:00.000Z',
};

const run = {
  kind: 'ab',
  id: '3f44d043-ad4d-4d4a-ba73-b2a956217ef1',
  weekStart: '2026-10-26',
  status: 'succeeded',
  isSample: true,
  costUsd: 0.2916,
  createdAt: '2026-11-08T10:00:00.000Z',
};

describe('RetrievalStatsResponse', () => {
  it('parses posts, including one whose post row is gone', () => {
    const gone = { ...post, topicTitle: null, url: null, weekStart: null };
    const body = { totalRuns: 7, posts: [post, gone] };
    expect(RetrievalStatsResponse.parse(body)).toEqual(body);
  });

  it('rejects a fractional hit count', () => {
    const body = { totalRuns: 7, posts: [{ ...post, trendHits: 1.5 }] };
    expect(RetrievalStatsResponse.safeParse(body).success).toBe(false);
  });
});

describe('CostStatsResponse', () => {
  it('parses A/B runs and stand-alone reports with a total', () => {
    const body = { runs: [run, { ...run, kind: 'report', isSample: false }], totalUsd: 0.35 };
    expect(CostStatsResponse.parse(body)).toEqual(body);
  });

  it('rejects a run kind other than ab and report', () => {
    const body = { runs: [{ ...run, kind: 'retrieval' }], totalUsd: 0 };
    expect(CostStatsResponse.safeParse(body).success).toBe(false);
  });
});
