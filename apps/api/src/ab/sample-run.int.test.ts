import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { createPgReportRepository } from '../generate/pg-report-repository';
import { createAbJobs } from './ab-jobs';
import { createPgAbRunRepository } from './pg-ab-run-repository';
import { exportSample, loadSampleIfEmpty } from './sample-run';

const { pool, db } = connect(process.env.DATABASE_URL!);
const week = '2026-10-26';
const reports = createPgReportRepository(db);
const abRepo = createPgAbRunRepository(db);
const jobs = createAbJobs({
  repo: abRepo,
  reports,
  run: () => Promise.reject(new Error('not used')),
  canGenerate: false,
});

const call = {
  step: 'judge_rubric' as const,
  attempt: 1,
  model: 'claude-opus-5-5',
  inputTokens: 100,
  outputTokens: 50,
  cacheWriteTokens: 0,
  cacheReadTokens: 20_000,
  costUsd: 0.01,
};
const document = {
  themes: [{ title: 't', summary: 's', approxPostCount: 1, citations: [1] }],
  notableThreads: [],
  mood: { summary: 'm', citations: [] },
  predictions: [],
};
const checks = {
  claims: 2,
  uncitedClaims: 1,
  citations: 1,
  notInCorpus: [],
  outsideWeek: [],
  notRetrieved: [],
};
const score = { score: 4, reason: 'r' };
const rubric = {
  grounding: score,
  specificity: score,
  coverage: score,
  predictionPlausibility: score,
  readability: score,
};

/** A finished live run, stored the way the job stores one. */
const storeRun = async () => {
  const report = await reports.createRun(week);
  await reports.succeed(report.id, {
    retrievalRunId: null as unknown as string,
    themes: ['a theme'],
    document,
    sources: [{ postId: 1, url: 'https://forum.test/p/1', topicTitle: 'T', weekStart: week }],
    evidence: [],
    calls: [call],
    costUsd: 0.01,
  });
  const run = await abRepo.createRun(week);
  await abRepo.linkReport(run.id, report.id);
  await abRepo.succeed(run.id, {
    noRag: document,
    checks: { rag: checks, no_rag: checks },
    rubric: { rag: rubric, no_rag: rubric },
    pairwise: {
      passes: [
        { x: 'rag', winner: 'rag', reason: 'a' },
        { x: 'no_rag', winner: 'tie', reason: 'b' },
      ],
      winner: 'tie',
    },
    calls: [call, call],
  });
  return (await jobs.get(run.id))!;
};

const truncate = () => db.execute(sql`truncate ab_runs, reports restart identity cascade`);
const fileWith = async (content: unknown) => {
  const file = join(await mkdtemp(join(tmpdir(), 'ab-sample-')), 'ab-run-sample.json');
  await writeFile(file, JSON.stringify(content));
  return file;
};

beforeAll(() => runMigrations(db));
beforeEach(truncate);
afterAll(() => pool.end());

describe('sample A/B run', () => {
  it('round-trips a run and its report through the sample file, marked as a sample', async () => {
    const live = await storeRun();
    const exported = exportSample(live, 'recorded for the test');
    // A real export names a retrieval run that a fresh database doesn't have.
    exported.abRun.ragReport!.retrievalRunId = '11111111-1111-4111-8111-111111111111';
    const file = await fileWith(exported);

    await truncate();
    expect(await loadSampleIfEmpty(db, file)).toBe('loaded');

    // The report is marked too, so the Report view never shows it as live output either.
    expect(await jobs.get(live.id)).toEqual({
      ...live,
      isSample: true,
      ragReport: { ...live.ragReport, retrievalRunId: null, isSample: true },
    });
    expect((await jobs.get(live.id))!.ragReport!.retrievalRunId).toBeNull();
  });

  it('leaves a database that already has A/B runs alone', async () => {
    const live = await storeRun();
    const file = await fileWith(exportSample(live, 'note'));

    expect(await loadSampleIfEmpty(db, file)).toBe('skipped');
    expect(await abRepo.listRuns()).toHaveLength(1);
  });

  it('reports a missing file instead of failing boot', async () => {
    expect(await loadSampleIfEmpty(db, '/nonexistent/ab-run-sample.json')).toBe('missing');
  });

  it('rejects a file that does not match the contract', async () => {
    const file = await fileWith({ note: 'x', abRun: { id: 'nope' } });
    await expect(loadSampleIfEmpty(db, file)).rejects.toThrow(/Invalid sample/);
  });
});
