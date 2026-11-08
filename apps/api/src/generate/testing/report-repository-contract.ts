import type { LlmCall } from '@cv/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GeneratedReport } from '../generate-report';
import type { ReportRepository } from '../report-repository';

export interface ContractSetup {
  repo: ReportRepository;
  /** An id the repo accepts as a retrieval run (a real row in Postgres). */
  retrievalRunId: string;
}

const week = '2026-10-26';
const calls: LlmCall[] = [
  {
    step: 'extract',
    attempt: 1,
    model: 'haiku',
    inputTokens: 100,
    outputTokens: 20,
    costUsd: 0.001,
  },
  {
    step: 'write',
    attempt: 1,
    model: 'sonnet',
    inputTokens: 900,
    outputTokens: 400,
    costUsd: 0.0058,
  },
];

const reportWith = (retrievalRunId: string): GeneratedReport => ({
  retrievalRunId,
  themes: ['colour shifts'],
  document: {
    themes: [{ title: 't', summary: 's', approxPostCount: 3, citations: [7] }],
    notableThreads: [],
    mood: { summary: 'calm', citations: [7] },
    predictions: [],
  },
  sources: [{ postId: 7, url: 'https://forum.test/p/7', topicTitle: 'T', weekStart: week }],
  calls,
  costUsd: 0.0068,
});

/** One suite for every ReportRepository, so the in-memory fake can't drift from Postgres. */
export const describeReportRepositoryContract = (
  name: string,
  setup: () => Promise<ContractSetup>,
) =>
  describe(`${name} report repository`, () => {
    let repo: ReportRepository;
    let retrievalRunId: string;
    beforeEach(async () => ({ repo, retrievalRunId } = await setup()));

    it('starts a run as running and empty, readable by id', async () => {
      const run = await repo.createRun(week);

      expect(run).toMatchObject({
        weekStart: week,
        status: 'running',
        finishedAt: null,
        document: null,
        calls: [],
        costUsd: 0,
        error: null,
      });
      expect(await repo.getRun(run.id)).toEqual(run);
    });

    it('stores a finished report, with the cost summed from its calls', async () => {
      const { id } = await repo.createRun(week);
      const report = reportWith(retrievalRunId);

      await repo.succeed(id, report);

      expect(await repo.getRun(id)).toMatchObject({
        ...report,
        status: 'succeeded',
        finishedAt: expect.any(String),
        costUsd: expect.closeTo(0.0068, 10),
        error: null,
      });
    });

    it('stores a failure with the calls it paid for', async () => {
      const { id } = await repo.createRun(week);

      await repo.fail(id, { code: 'cost_cap_exceeded', message: 'stopped' }, calls.slice(0, 1));

      expect(await repo.getRun(id)).toMatchObject({
        status: 'failed',
        document: null,
        calls: calls.slice(0, 1),
        costUsd: expect.closeTo(0.001, 10),
        error: { code: 'cost_cap_exceeded', message: 'stopped' },
      });
    });

    it('lists runs newest first, for one week or all', async () => {
      const first = await repo.createRun(week);
      const other = await repo.createRun('2026-10-19');
      const second = await repo.createRun(week);

      expect((await repo.listRuns(week)).map((r) => r.id)).toEqual([second.id, first.id]);
      expect((await repo.listRuns()).map((r) => r.id)).toEqual([second.id, other.id, first.id]);
    });

    it('returns undefined for an unknown id, malformed or not', async () => {
      expect(await repo.getRun('nope')).toBeUndefined();
      expect(await repo.getRun('00000000-0000-4000-8000-000000000000')).toBeUndefined();
    });

    it('fails only the runs still running at boot', async () => {
      const done = await repo.createRun(week);
      await repo.fail(done.id, { code: 'refused', message: 'no' }, []);
      const stuck = await repo.createRun(week);

      expect(await repo.failInterruptedRuns()).toBe(1);
      expect(await repo.getRun(stuck.id)).toMatchObject({
        status: 'failed',
        error: { code: 'interrupted' },
      });
      expect((await repo.getRun(done.id))!.error!.code).toBe('refused');
    });
  });
