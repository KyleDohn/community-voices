import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client';
import { reports } from '../db/schema';
import { sumCost } from './cost';
import { INTERRUPTED, type ReportRepository, type ReportRun } from './report-repository';

type Row = typeof reports.$inferSelect;

// Postgres rejects a malformed uuid with an error; to the API it is just an unknown run.
const isUuid = (id: string) => z.uuid().safeParse(id).success;

const toRun = (row: Row): ReportRun => ({
  id: row.id,
  weekStart: row.weekStart,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  finishedAt: row.finishedAt?.toISOString() ?? null,
  retrievalRunId: row.retrievalRunId,
  themes: row.themes,
  document: row.document,
  sources: row.sources,
  calls: row.calls,
  costUsd: row.costUsd,
  error: row.errorCode ? { code: row.errorCode, message: row.errorMessage ?? '' } : null,
});

export const createPgReportRepository = (db: Database): ReportRepository => {
  const finish = (id: string, changes: Partial<typeof reports.$inferInsert>) =>
    db
      .update(reports)
      .set({ ...changes, finishedAt: new Date() })
      .where(eq(reports.id, id));

  return {
    createRun: async (weekStart) => {
      const [row] = await db.insert(reports).values({ weekStart, status: 'running' }).returning();
      return toRun(row!);
    },

    getRun: async (id) => {
      if (!isUuid(id)) return undefined;
      const [row] = await db.select().from(reports).where(eq(reports.id, id));
      return row && toRun(row);
    },

    listRuns: async (weekStart) => {
      const rows = await db
        .select()
        .from(reports)
        .where(weekStart ? eq(reports.weekStart, weekStart) : undefined)
        .orderBy(desc(reports.createdAt));
      return rows.map(toRun);
    },

    succeed: async (id, { retrievalRunId, themes, document, sources, calls }) => {
      await finish(id, {
        status: 'succeeded',
        retrievalRunId,
        themes,
        document,
        sources,
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
        .update(reports)
        .set({
          status: 'failed',
          errorCode: INTERRUPTED.code,
          errorMessage: INTERRUPTED.message,
          finishedAt: new Date(),
        })
        .where(eq(reports.status, 'running'))
        .returning({ id: reports.id });
      return failed.length;
    },
  };
};
