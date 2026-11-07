/** `pnpm seed:export` writes the stored corpus to seed/<host>-<from>-<to>.json for committing. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config';
import { connect } from '../db/client';
import { createPgIngestionRepository } from '../ingest/pg-ingestion-repository';
import { ingestionWindow } from '../ingest/week';
import { exportSeed, SEED_DIR, seedFileName } from '../seed/seed';

const config = loadConfig(process.env);
const { pool, db } = connect(config.databaseUrl);
const window = ingestionWindow(new Date(), config.ingest.historyWeeks);

const seed = await exportSeed(createPgIngestionRepository(db), {
  baseUrl: config.ingest.discourseBaseUrl,
  license: 'CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/)',
  window,
});
const file = join(SEED_DIR, seedFileName(config.ingest.discourseBaseUrl, window));
await mkdir(SEED_DIR, { recursive: true });
await writeFile(file, JSON.stringify(seed) + '\n');
console.log(`Wrote ${seed.topics.length} topics and ${seed.posts.length} posts to ${file}`);
await pool.end();
