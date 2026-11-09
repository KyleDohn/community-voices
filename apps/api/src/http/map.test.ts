import { ErrorResponse, MapResponse, type MapPoint, type MapStatus } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { MapSource } from './map';
import { testDependencies } from './testing/test-dependencies';

const point: MapPoint = {
  chunkId: 1,
  postId: 463229,
  x: 1,
  y: 2,
  weekStart: '2026-10-26',
  topicTitle: 'darktable 5.4',
  postNumber: 3,
  url: 'https://forum.test/t/1/3',
  runs: 2,
};
const reportId = '3f44d043-ad4d-4d4a-ba73-b2a956217ef1';

const appWith = (status: MapStatus = 'ready', points = [point]) => {
  const map: MapSource = {
    status: () => status,
    points: async () => points,
    reportPostIds: async (id) => (id === reportId ? [463229, 470001] : undefined),
  };
  return createApp(testDependencies({ map }));
};

const get = async (path: string, status?: MapStatus) => {
  const res = await appWith(status).request(`/api/v1/embeddings/map${path}`);
  return { res, body: (await res.json()) as unknown };
};

describe('GET /embeddings/map', () => {
  it('returns the points with nothing highlighted', async () => {
    const { res, body } = await get('');
    expect(res.status).toBe(200);
    expect(MapResponse.parse(body)).toEqual({
      status: 'ready',
      points: [point],
      highlightPostIds: [],
    });
  });

  it("highlights the report's source posts", async () => {
    const { body } = await get(`?reportId=${reportId}`);
    expect(MapResponse.parse(body).highlightPostIds).toEqual([463229, 470001]);
  });

  it('sends no points while computing', async () => {
    const { res, body } = await get('', 'computing');
    expect(res.status).toBe(200);
    expect(MapResponse.parse(body)).toEqual({
      status: 'computing',
      points: [],
      highlightPostIds: [],
    });
  });

  it('still sends the stored points after a failed refresh', async () => {
    const { body } = await get('', 'failed');
    expect(MapResponse.parse(body).points).toEqual([point]);
  });

  it('gzips a large response for a client that accepts it', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...point, chunkId: i }));
    const res = await appWith('ready', many).request('/api/v1/embeddings/map', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    expect(res.headers.get('Content-Encoding')).toBe('gzip');
  });

  it('rejects a reportId that is not a uuid', async () => {
    const { res, body } = await get('?reportId=nope');
    expect(res.status).toBe(400);
    expect(ErrorResponse.parse(body).error).toBe('invalid_request');
  });

  it('answers 404 for an unknown report', async () => {
    const { res, body } = await get('?reportId=00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(ErrorResponse.parse(body).error).toBe('report_not_found');
  });
});
