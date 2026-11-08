import {
  AcceptedResponse,
  ErrorResponse,
  ReportListResponse,
  ReportRunResponse,
  type ReportDocument,
} from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { GenerationError, type GeneratedReport } from '../generate/generate-report';
import { fakeReportJobs } from '../generate/testing/fake-report-jobs';
import { createApp } from './app';
import { testDependencies } from './testing/test-dependencies';

const week = '2026-10-26';

const document: ReportDocument = {
  themes: [],
  notableThreads: [],
  mood: { summary: 'Insufficient evidence', citations: [] },
  predictions: [],
};

const call = {
  step: 'extract' as const,
  attempt: 1,
  model: 'haiku',
  inputTokens: 10,
  outputTokens: 5,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0.01,
};

const generated: GeneratedReport = {
  retrievalRunId: 'run-1',
  themes: ['a theme'],
  document,
  sources: [{ postId: 1, url: 'https://forum.test/p/1', topicTitle: 'T', weekStart: week }],
  calls: [call],
  costUsd: 0.01,
};

const setup = (options: Parameters<typeof fakeReportJobs>[0] = {}) => {
  const reports = fakeReportJobs({ generate: async () => generated, ...options });
  return { app: createApp(testDependencies({ reports })), reports };
};

const post = (app: ReturnType<typeof setup>['app'], body: unknown) =>
  app.request('/api/v1/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/v1/reports', () => {
  it('accepts a run with 202, and polling shows the finished document and its cost', async () => {
    const { app, reports } = setup();

    const res = await post(app, { week });
    expect(res.status).toBe(202);
    const { id } = AcceptedResponse.parse(await res.json());
    await reports.settled();

    const poll = await app.request(`/api/v1/reports/${id}`);
    expect(poll.status).toBe(200);
    expect(ReportRunResponse.parse(await poll.json())).toMatchObject({
      id,
      weekStart: week,
      status: 'succeeded',
      retrievalRunId: 'run-1',
      themes: ['a theme'],
      document,
      sources: generated.sources,
      calls: [call],
      costUsd: 0.01,
      error: null,
    });
  });

  it('records why a run stopped, and what it spent first', async () => {
    const generate = async () => {
      throw new GenerationError('cost_cap_exceeded', 'Stopped before the write call', [call]);
    };
    const { app, reports } = setup({ generate });

    const { id } = AcceptedResponse.parse(await (await post(app, { week })).json());
    await reports.settled();

    const run = ReportRunResponse.parse(await (await app.request(`/api/v1/reports/${id}`)).json());
    expect(run).toMatchObject({
      status: 'failed',
      document: null,
      calls: [call],
      costUsd: 0.01,
      error: { code: 'cost_cap_exceeded', message: 'Stopped before the write call' },
    });
  });

  it('records an unexpected crash as a failed run, not a stuck one', async () => {
    const { app, reports } = setup({ generate: async () => Promise.reject(new Error('db down')) });

    const { id } = AcceptedResponse.parse(await (await post(app, { week })).json());
    await reports.settled();

    const run = ReportRunResponse.parse(await (await app.request(`/api/v1/reports/${id}`)).json());
    expect(run).toMatchObject({ status: 'failed', error: { code: 'internal' } });
  });

  it('answers 400 for a week that is not a Monday', async () => {
    const res = await post(setup().app, { week: '2026-10-27' });
    expect(res.status).toBe(400);
    expect(ErrorResponse.parse(await res.json())).toMatchObject({
      error: 'invalid_request',
      message: expect.stringContaining('Monday'),
    });
  });

  it('answers 409 while another run is in flight', async () => {
    const { app } = setup({ generate: () => new Promise(() => undefined) });
    await post(app, { week });

    const res = await post(app, { week });

    expect(res.status).toBe(409);
    expect(ErrorResponse.parse(await res.json()).error).toBe('report_in_progress');
  });

  it('answers 503 without an API key, and starts nothing', async () => {
    const { app } = setup({ canGenerate: false });

    const res = await post(app, { week });

    expect(res.status).toBe(503);
    expect(ErrorResponse.parse(await res.json()).error).toBe('llm_unavailable');
    const list = ReportListResponse.parse(await (await app.request('/api/v1/reports')).json());
    expect(list.reports).toEqual([]);
  });
});

describe('GET /api/v1/reports', () => {
  it("lists a week's runs newest first", async () => {
    const { app, reports } = setup();
    for (const w of [week, '2026-10-19', week]) {
      await post(app, { week: w });
      await reports.settled();
    }

    const res = await app.request(`/api/v1/reports?week=${week}`);

    const { reports: listed } = ReportListResponse.parse(await res.json());
    expect(listed.map((r) => r.weekStart)).toEqual([week, week]);
    expect(listed[0]!.createdAt >= listed[1]!.createdAt).toBe(true);
    expect(listed[0]!.id).not.toBe(listed[1]!.id);
  });

  it('answers 404 for an unknown run', async () => {
    const res = await setup().app.request('/api/v1/reports/nope');
    expect(res.status).toBe(404);
    expect(ErrorResponse.parse(await res.json()).error).toBe('not_found');
  });
});
