import { AcceptedResponse, ErrorResponse, IngestionRunResponse } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { fakeIngestionJobs } from '../ingest/testing/fake-ingestion-jobs';
import { createApp } from './app';

const setup = () => {
  const ingestions = fakeIngestionJobs();
  const app = createApp({ probeDatabase: async () => true, ingestions });
  return { app, ingestions };
};

describe('POST /api/v1/ingestions', () => {
  it('accepts a run with 202 and its id, which can then be polled', async () => {
    const { app } = setup();

    const res = await app.request('/api/v1/ingestions', { method: 'POST' });
    expect(res.status).toBe(202);
    const { id } = AcceptedResponse.parse(await res.json());

    const poll = await app.request(`/api/v1/ingestions/${id}`);
    expect(poll.status).toBe(200);
    expect(IngestionRunResponse.parse(await poll.json())).toMatchObject({
      id,
      windowStart: '2026-11-02T00:00:00.000Z',
      windowEnd: '2026-11-09T00:00:00.000Z',
    });
  });

  it('answers 409 while another run is in flight', async () => {
    const { app } = setup();
    await app.request('/api/v1/ingestions', { method: 'POST' });

    const res = await app.request('/api/v1/ingestions', { method: 'POST' });

    expect(res.status).toBe(409);
    expect(ErrorResponse.parse(await res.json()).error).toBe('ingestion_in_progress');
  });
});

describe('GET /api/v1/ingestions/:id', () => {
  it('answers 404 for an unknown run', async () => {
    const res = await setup().app.request('/api/v1/ingestions/nope');

    expect(res.status).toBe(404);
    expect(ErrorResponse.parse(await res.json()).error).toBe('not_found');
  });
});

describe('unexpected errors', () => {
  it('answer 500 with an ErrorResponse body', async () => {
    const ingestions = {
      ...fakeIngestionJobs(),
      trigger: async () => {
        throw new Error('database is down');
      },
    };
    const app = createApp({ probeDatabase: async () => true, ingestions });

    const res = await app.request('/api/v1/ingestions', { method: 'POST' });

    expect(res.status).toBe(500);
    expect(ErrorResponse.parse(await res.json()).error).toBe('internal');
  });
});
