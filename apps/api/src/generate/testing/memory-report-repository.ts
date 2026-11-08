import { sumCost } from '../cost';
import { INTERRUPTED, type ReportRepository, type ReportRun } from '../report-repository';

export const createMemoryReportRepository = (): ReportRepository => {
  const runs: ReportRun[] = [];
  const update = (id: string, changes: Partial<ReportRun>) => {
    const index = runs.findIndex((r) => r.id === id);
    runs[index] = { ...runs[index]!, ...changes, finishedAt: new Date().toISOString() };
  };

  return {
    createRun: async (weekStart) => {
      const run: ReportRun = {
        id: `report-${runs.length + 1}`,
        weekStart,
        status: 'running',
        createdAt: new Date().toISOString(),
        finishedAt: null,
        retrievalRunId: null,
        themes: [],
        document: null,
        sources: [],
        calls: [],
        costUsd: 0,
        error: null,
        isSample: false,
      };
      runs.push(run);
      return run;
    },
    getRun: async (id) => runs.find((r) => r.id === id),
    listRuns: async (weekStart) =>
      runs.filter((r) => !weekStart || r.weekStart === weekStart).toReversed(),
    succeed: async (id, { retrievalRunId, themes, document, sources, calls }) =>
      update(id, {
        status: 'succeeded',
        retrievalRunId,
        themes,
        document,
        sources,
        calls,
        costUsd: sumCost(calls),
      }),
    fail: async (id, error, calls) =>
      update(id, { status: 'failed', error, calls, costUsd: sumCost(calls) }),
    failInterruptedRuns: async () => {
      const stuck = runs.filter((r) => r.status === 'running');
      for (const r of stuck) update(r.id, { status: 'failed', error: INTERRUPTED });
      return stuck.length;
    },
  };
};
