import type { LlmCall, ReportDocument } from '@cv/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AbOutcome, AbRunRepository } from '../ab-run-repository';

export interface AbContractSetup {
  repo: AbRunRepository;
  /** An id the repo accepts as a report run (a real row in Postgres). */
  reportId: string;
}

const week = '2026-10-26';

const call = (step: LlmCall['step'], costUsd: number): LlmCall => ({
  step,
  attempt: 1,
  model: 'm',
  inputTokens: 10,
  outputTokens: 5,
  cacheWriteTokens: 0,
  cacheReadTokens: 3,
  costUsd,
});

const document: ReportDocument = {
  themes: [{ title: 't', summary: 's', approxPostCount: 1, citations: [999] }],
  notableThreads: [],
  mood: { summary: 'm', citations: [] },
  predictions: [],
};
const checks = {
  claims: 2,
  uncitedClaims: 1,
  citations: 1,
  notInCorpus: [999],
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

const outcome: AbOutcome = {
  noRag: document,
  checks: { rag: { ...checks, notInCorpus: [] }, no_rag: checks },
  rubric: { rag: rubric, no_rag: { ...rubric, grounding: { score: 1, reason: 'invented' } } },
  pairwise: {
    passes: [
      { x: 'rag', winner: 'rag', reason: 'a' },
      { x: 'no_rag', winner: 'rag', reason: 'b' },
    ],
    winner: 'rag',
  },
  calls: [call('write', 0.05), call('judge_rubric', 0.1)],
};

/** One suite for every AbRunRepository, so the in-memory fake can't drift from Postgres. */
export const describeAbRunRepositoryContract = (
  name: string,
  setup: () => Promise<AbContractSetup>,
) =>
  describe(`${name} A/B run repository`, () => {
    let repo: AbRunRepository;
    let reportId: string;
    beforeEach(async () => ({ repo, reportId } = await setup()));

    it('starts a run as running and empty, readable by id', async () => {
      const run = await repo.createRun(week);

      expect(run).toEqual({
        id: expect.any(String),
        weekStart: week,
        status: 'running',
        createdAt: expect.any(String),
        finishedAt: null,
        isSample: false,
        reportId: null,
        noRagDocument: null,
        checks: null,
        rubric: null,
        pairwise: null,
        calls: [],
        costUsd: 0,
        error: null,
      });
      expect(await repo.getRun(run.id)).toEqual(run);
    });

    it('links the report as soon as it exists, while still running', async () => {
      const { id } = await repo.createRun(week);
      await repo.linkReport(id, reportId);
      expect(await repo.getRun(id)).toMatchObject({ status: 'running', reportId });
    });

    it('stores a finished run, with the cost summed from every call', async () => {
      const { id } = await repo.createRun(week);
      await repo.linkReport(id, reportId);

      await repo.succeed(id, outcome);

      expect(await repo.getRun(id)).toMatchObject({
        status: 'succeeded',
        finishedAt: expect.any(String),
        reportId,
        noRagDocument: outcome.noRag,
        checks: outcome.checks,
        rubric: outcome.rubric,
        pairwise: outcome.pairwise,
        calls: outcome.calls,
        costUsd: expect.closeTo(0.15, 10),
        error: null,
      });
    });

    it('stores a failure with the calls already paid for', async () => {
      const { id } = await repo.createRun(week);
      const error = { code: 'cost_cap_exceeded', message: 'over the cap' };

      await repo.fail(id, error, outcome.calls);

      expect(await repo.getRun(id)).toMatchObject({
        status: 'failed',
        finishedAt: expect.any(String),
        error,
        calls: outcome.calls,
        costUsd: expect.closeTo(0.15, 10),
        noRagDocument: null,
      });
    });

    it('lists runs newest first', async () => {
      const first = await repo.createRun(week);
      const second = await repo.createRun('2026-10-19');
      expect((await repo.listRuns()).map((r) => r.id)).toEqual([second.id, first.id]);
    });

    it('fails runs left running by a previous process', async () => {
      const stuck = await repo.createRun(week);
      const done = await repo.createRun(week);
      await repo.succeed(done.id, outcome);

      expect(await repo.failInterruptedRuns()).toBe(1);
      expect(await repo.getRun(stuck.id)).toMatchObject({
        status: 'failed',
        error: { code: 'interrupted' },
      });
      expect((await repo.getRun(done.id))!.status).toBe('succeeded');
    });

    it('returns nothing for an unknown id, including one that is not a uuid', async () => {
      expect(await repo.getRun('00000000-0000-4000-8000-000000000000')).toBeUndefined();
      expect(await repo.getRun('nope')).toBeUndefined();
    });
  });
