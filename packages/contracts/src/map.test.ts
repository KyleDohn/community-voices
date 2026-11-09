import { describe, expect, it } from 'vitest';
import { MapResponse } from './map';

const point = {
  chunkId: 101,
  postId: 463229,
  x: 5.53,
  y: -2.1,
  weekStart: '2026-10-26',
  topicTitle: 'darktable 5.4 released',
  postNumber: 3,
  url: 'https://discuss.pixls.us/t/darktable-5-4/1/3',
  runs: 0,
};

describe('MapResponse', () => {
  it('parses a ready map with a highlighted report', () => {
    const body = { status: 'ready', points: [point], highlightPostIds: [463229] };
    expect(MapResponse.parse(body)).toEqual(body);
  });

  it('parses a map that is still computing', () => {
    const body = { status: 'computing', points: [], highlightPostIds: [] };
    expect(MapResponse.parse(body)).toEqual(body);
  });

  it('parses a failed refresh that still serves the previous points', () => {
    const body = { status: 'failed', points: [point], highlightPostIds: [] };
    expect(MapResponse.parse(body)).toEqual(body);
  });

  it('rejects points while the map is computing', () => {
    const body = { status: 'computing', points: [point], highlightPostIds: [] };
    expect(MapResponse.safeParse(body).success).toBe(false);
  });

  it('rejects a non-finite coordinate', () => {
    const body = { status: 'ready', points: [{ ...point, x: Infinity }], highlightPostIds: [] };
    expect(MapResponse.safeParse(body).success).toBe(false);
  });
});
