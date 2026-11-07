import { ErrorResponse, HealthResponse } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { testDependencies } from './testing/test-dependencies';

const getHealth = async (probeDatabase: () => Promise<boolean>) => {
  const res = await createApp(testDependencies({ probeDatabase })).request('/api/v1/health');
  return { status: res.status, body: HealthResponse.parse(await res.json()) };
};

describe('GET /api/v1/health', () => {
  it('reports ok when the database is reachable', async () => {
    const { status, body } = await getHealth(async () => true);
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', database: 'up' });
  });

  it('reports degraded with 503 when the database is unreachable', async () => {
    const { status, body } = await getHealth(async () => false);
    expect(status).toBe(503);
    expect(body).toEqual({ status: 'degraded', database: 'down' });
  });

  it('treats a throwing probe as unreachable', async () => {
    const { status, body } = await getHealth(async () => {
      throw new Error('connection refused');
    });
    expect(status).toBe(503);
    expect(body.database).toBe('down');
  });
});

describe('unknown API routes', () => {
  it('return a JSON 404 instead of falling through to the web app', async () => {
    const res = await createApp(testDependencies()).request('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(ErrorResponse.parse(await res.json()).error).toBe('not_found');
  });
});
