import { sumCost } from '../../generate/cost';
import { INTERRUPTED } from '../../generate/report-repository';
import type { AbRun, AbRunRepository } from '../ab-run-repository';

export const createMemoryAbRunRepository = (): AbRunRepository => {
  const runs: AbRun[] = [];
  const update = (id: string, changes: Partial<AbRun>) => {
    const index = runs.findIndex((r) => r.id === id);
    runs[index] = { ...runs[index]!, ...changes };
  };
  const finish = (id: string, changes: Partial<AbRun>) =>
    update(id, { ...changes, finishedAt: new Date().toISOString() });

  return {
    createRun: async (weekStart) => {
      const run: AbRun = {
        id: `ab-${runs.length + 1}`,
        weekStart,
        status: 'running',
        createdAt: new Date().toISOString(),
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
      };
      runs.push(run);
      return run;
    },
    getRun: async (id) => runs.find((r) => r.id === id),
    listRuns: async () => runs.toReversed(),
    linkReport: async (id, reportId) => update(id, { reportId }),
    succeed: async (id, { noRag, checks, rubric, pairwise, calls }) =>
      finish(id, {
        status: 'succeeded',
        noRagDocument: noRag,
        checks,
        rubric,
        pairwise,
        calls,
        costUsd: sumCost(calls),
      }),
    fail: async (id, error, calls) =>
      finish(id, { status: 'failed', error, calls, costUsd: sumCost(calls) }),
    failInterruptedRuns: async () => {
      const stuck = runs.filter((r) => r.status === 'running');
      for (const r of stuck) finish(r.id, { status: 'failed', error: INTERRUPTED });
      return stuck.length;
    },
  };
};
