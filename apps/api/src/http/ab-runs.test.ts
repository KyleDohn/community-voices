import {
  AbRunListResponse,
  AbRunResponse,
  AcceptedResponse,
  ErrorResponse,
  type LlmCall,
  type ReportDocument,
} from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import type { AbOptions, AbResult } from '../ab/run-ab';
import { fakeAbJobs } from '../ab/testing/fake-ab-jobs';
import { GenerationError, type GeneratedReport } from '../generate/generate-report';
import { createApp } from './app';
import { testDependencies } from './testing/test-dependencies';

const week = '2026-10-26';

const call = (step: LlmCall['step']): LlmCall => ({
  step,
  attempt: 1,
  model: 'm',
  inputTokens: 10,
  outputTokens: 5,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0.01,
});

const doc = (title: string): ReportDocument => ({
  themes: [{ title, summary: 's', approxPostCount: 1, citations: [1] }],
  notableThreads: [],
  mood: { summary: 'm', citations: [] },
  predictions: [],
});

const report: GeneratedReport = {
  retrievalRunId: 'run-1',
  themes: ['a theme'],
  document: doc('with posts'),
  sources: [{ postId: 1, url: 'https://forum.test/p/1', topicTitle: 'T', weekStart: week }],
  evidence: [],
  calls: [call('write')],
  costUsd: 0.01,
};

const checks = {
  claims: 2,
  uncitedClaims: 1,
  citations: 1,
  notInCorpus: [],
  outsideWeek: [],
  notRetrieved: [],
};
const score = { score: 3, reason: 'r' };
const rubric = {
  grounding: score,
  specificity: score,
  coverage: score,
  predictionPlausibility: score,
  readability: score,
};
const result: AbResult = {
  report,
  noRag: doc('no posts'),
  checks: { rag: checks, no_rag: checks },
  rubric: { rag: rubric, no_rag: rubric },
  pairwise: {
    passes: [
      { x: 'rag', winner: 'rag', reason: 'a' },
      { x: 'no_rag', winner: 'rag', reason: 'b' },
    ],
    winner: 'rag',
  },
  calls: [call('write'), call('write_no_rag'), call('judge_rubric')],
  costUsd: 0.03,
};

type Run = (week: string, options: AbOptions) => Promise<AbResult>;

const succeeding: Run = async (_week, { onReport }) => {
  await onReport?.(report);
  return result;
};

const setup = (options: Parameters<typeof fakeAbJobs>[0] = { run: succeeding }) => {
  const abRuns = fakeAbJobs(options);
  return { app: createApp(testDependencies({ abRuns })), abRuns };
};

const post = (app: ReturnType<typeof setup>['app'], body: unknown) =>
  app.request('/api/v1/ab-runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const poll = async (app: ReturnType<typeof setup>['app'], id: string) =>
  AbRunResponse.parse(await (await app.request(`/api/v1/ab-runs/${id}`)).json());

describe('POST /api/v1/ab-runs', () => {
  it('accepts a run with 202, and polling shows both documents, the scores and the cost', async () => {
    const { app, abRuns } = setup();

    const res = await post(app, { week });
    expect(res.status).toBe(202);
    const { id } = AcceptedResponse.parse(await res.json());
    await abRuns.settled();

    expect(await poll(app, id)).toMatchObject({
      id,
      weekStart: week,
      status: 'succeeded',
      isSample: false,
      ragReport: {
        status: 'succeeded',
        document: report.document,
        sources: report.sources,
        calls: report.calls,
      },
      noRagDocument: result.noRag,
      checks: result.checks,
      rubric: result.rubric,
      pairwise: result.pairwise,
      calls: result.calls,
      costUsd: expect.closeTo(0.03, 10),
      error: null,
    });
  });

  it('keeps the RAG report and the calls paid for when a later step fails', async () => {
    const run: Run = async (_week, { onReport }) => {
      await onReport?.(report);
      throw new GenerationError('spend_limit_reached', 'limit', [
        call('write'),
        call('write_no_rag'),
      ]);
    };
    const { app, abRuns } = setup({ run });

    const { id } = AcceptedResponse.parse(await (await post(app, { week })).json());
    await abRuns.settled();

    expect(await poll(app, id)).toMatchObject({
      status: 'failed',
      ragReport: { status: 'succeeded', document: report.document },
      noRagDocument: null,
      calls: [call('write'), call('write_no_rag')],
      costUsd: expect.closeTo(0.02, 10),
      error: { code: 'spend_limit_reached', message: 'limit' },
    });
  });

  it('records an unexpected crash as a failed run, not a stuck one', async () => {
    const { app, abRuns } = setup({ run: () => Promise.reject(new Error('boom')) });

    const { id } = AcceptedResponse.parse(await (await post(app, { week })).json());
    await abRuns.settled();

    expect(await poll(app, id)).toMatchObject({
      status: 'failed',
      ragReport: null,
      error: { code: 'internal' },
    });
  });

  it('answers 400 for a week that is not a Monday', async () => {
    const res = await post(setup().app, { week: '2026-10-27' });
    expect(res.status).toBe(400);
    expect(ErrorResponse.parse(await res.json()).error).toBe('invalid_request');
  });

  it('answers 409 while another A/B run is in flight', async () => {
    const { app } = setup({ run: () => new Promise(() => undefined) });
    await post(app, { week });

    const res = await post(app, { week });

    expect(res.status).toBe(409);
    expect(ErrorResponse.parse(await res.json()).error).toBe('ab_run_in_progress');
  });

  it('answers 503 without an API key, and starts nothing', async () => {
    const { app } = setup({ canGenerate: false });

    const res = await post(app, { week });

    expect(res.status).toBe(503);
    expect(ErrorResponse.parse(await res.json()).error).toBe('llm_unavailable');
    const list = AbRunListResponse.parse(await (await app.request('/api/v1/ab-runs')).json());
    expect(list.abRuns).toEqual([]);
  });
});

describe('GET /api/v1/ab-runs', () => {
  it('lists runs newest first', async () => {
    const { app, abRuns } = setup();
    const first = AcceptedResponse.parse(await (await post(app, { week })).json());
    await abRuns.settled();
    const second = AcceptedResponse.parse(await (await post(app, { week: '2026-10-19' })).json());
    await abRuns.settled();

    const list = AbRunListResponse.parse(await (await app.request('/api/v1/ab-runs')).json());

    expect(list.abRuns.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(list.abRuns[1]).toEqual({
      id: first.id,
      weekStart: week,
      status: 'succeeded',
      createdAt: expect.any(String),
      costUsd: expect.closeTo(0.03, 10),
      isSample: false,
    });
  });

  it('answers 404 for an unknown run', async () => {
    const res = await setup().app.request('/api/v1/ab-runs/nope');
    expect(res.status).toBe(404);
    expect(ErrorResponse.parse(await res.json()).error).toBe('not_found');
  });
});
