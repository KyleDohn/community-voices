import { sql } from 'drizzle-orm';
import { afterAll, beforeAll } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { createPgRetrievalLog } from '../retrieve/pg-retrieval-log';
import { createPgReportRepository } from './pg-report-repository';
import { describeReportRepositoryContract } from './testing/report-repository-contract';

const { pool, db } = connect(process.env.DATABASE_URL!);

beforeAll(() => runMigrations(db));
afterAll(() => pool.end());

describeReportRepositoryContract('Postgres', async () => {
  await db.execute(sql`truncate reports, retrieval_runs restart identity cascade`);
  return {
    repo: createPgReportRepository(db),
    retrievalRunId: await createPgRetrievalLog(db).record('2026-10-26', []),
  };
});
