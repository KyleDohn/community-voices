import { sql } from 'drizzle-orm';
import { afterAll, beforeAll } from 'vitest';
import { connect, runMigrations } from '../db/client';
import { createPgReportRepository } from '../generate/pg-report-repository';
import { createPgAbRunRepository } from './pg-ab-run-repository';
import { describeAbRunRepositoryContract } from './testing/ab-run-repository-contract';

const { pool, db } = connect(process.env.DATABASE_URL!);

beforeAll(() => runMigrations(db));
afterAll(() => pool.end());

describeAbRunRepositoryContract('Postgres', async () => {
  await db.execute(sql`truncate ab_runs, reports restart identity cascade`);
  return {
    repo: createPgAbRunRepository(db),
    reportId: (await createPgReportRepository(db).createRun('2026-10-26')).id,
  };
});
