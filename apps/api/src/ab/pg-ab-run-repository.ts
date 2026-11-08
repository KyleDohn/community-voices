import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client';
import { abRuns } from '../db/schema';
import { sumCost } from '../generate/cost';
import { INTERRUPTED } from '../generate/report-repository';
import type { AbRun, AbRunRepository } from './ab-run-repository';

type Row = typeof abRuns.$inferSelect;

// Postgres rejects a malformed uuid with an error; to the API it is just an unknown run.
const isUuid = (id: string) => z.uuid().safeParse(id).success;

const toRun = (row: Row): AbRun => ({
  id: row.id,
  weekStart: row.weekStart,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  finishedAt: row.finishedAt?.toISOString() ?? null,
  isSample: row.isSample,
  reportId: row.reportId,
  noRagDocument: row.noRagDocument,
  checks: row.checks,
  rubric: row.rubric,
  pairwise: row.pairwise,
  calls: row.calls,
  costUsd: row.costUsd,
  error: row.errorCode ? { code: row.errorCode, message: row.errorMessage ?? '' } : null,
});

export const createPgAbRunRepository = (db: Database): AbRunRepository => {
  const set = (id: string, changes: Partial<typeof abRuns.$inferInsert>) =>
    db.update(abRuns).set(changes).where(eq(abRuns.id, id));
  const finish = (id: string, changes: Partial<typeof abRuns.$inferInsert>) =>
    set(id, { ...changes, finishedAt: new Date() });

  return {
    createRun: async (weekStart) => {
      const [row] = await db.insert(abRuns).values({ weekStart, status: 'running' }).returning();
      return toRun(row!);
    },

    getRun: async (id) => {
      if (!isUuid(id)) return undefined;
      const [row] = await db.select().from(abRuns).where(eq(abRuns.id, id));
      return row && toRun(row);
    },

    listRuns: async () =>
      (await db.select().from(abRuns).orderBy(desc(abRuns.createdAt))).map(toRun),

    linkReport: async (id, reportId) => {
      await set(id, { reportId });
    },

    succeed: async (id, { noRag, checks, rubric, pairwise, calls }) => {
      await finish(id, {
        status: 'succeeded',
        noRagDocument: noRag,
        checks,
        rubric,
        pairwise,
        calls,
        costUsd: sumCost(calls),
      });
    },

    fail: async (id, error, calls) => {
      await finish(id, {
        status: 'failed',
        calls,
        costUsd: sumCost(calls),
        errorCode: error.code,
        errorMessage: error.message,
      });
    },

    failInterruptedRuns: async () => {
      const failed = await db
        .update(abRuns)
        .set({
          status: 'failed',
          errorCode: INTERRUPTED.code,
          errorMessage: INTERRUPTED.message,
          finishedAt: new Date(),
        })
        .where(eq(abRuns.status, 'running'))
        .returning({ id: abRuns.id });
      return failed.length;
    },
  };
};
