/** `pnpm ab:export-sample <id>` writes one finished A/B run to seed/ab-run-sample.json for committing. */
import { writeFile } from 'node:fs/promises';
import { createAbJobs } from '../ab/ab-jobs';
import { createPgAbRunRepository } from '../ab/pg-ab-run-repository';
import { exportSample, SAMPLE_FILE } from '../ab/sample-run';
import { loadConfig } from '../config';
import { connect } from '../db/client';
import { createPgReportRepository } from '../generate/pg-report-repository';

const id = process.argv[2];
if (!id) throw new Error('Usage: pnpm ab:export-sample <ab-run-id>');

const config = loadConfig(process.env);
const { pool, db } = connect(config.databaseUrl);
const jobs = createAbJobs({
  repo: createPgAbRunRepository(db),
  reports: createPgReportRepository(db),
  run: () => Promise.reject(new Error('Export only')),
  canGenerate: false,
});

const run = await jobs.get(id);
if (run?.status !== 'succeeded') throw new Error(`A/B run ${id} is ${run?.status ?? 'missing'}`);
const models = [...new Set(run.calls.map((c) => c.model))].join(', ');
const note = `A real A/B run for the week of ${run.weekStart}, recorded ${run.createdAt} with ${models}.`;
await writeFile(SAMPLE_FILE, JSON.stringify(exportSample(run, note), null, 2) + '\n');
console.log(`Wrote ${SAMPLE_FILE}: ${note}`);
await pool.end();
