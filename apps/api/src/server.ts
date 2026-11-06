import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { loadConfig } from './config';
import { connect, probe, runMigrations } from './db/client';
import { createApp } from './http/app';
import { createIngestionJobs } from './ingest/ingestion-jobs';
import { createPgIngestionRepository } from './ingest/pg-ingestion-repository';
import { ingestionWindow } from './ingest/week';
import { createIngestion } from './ingest/wiring';

const config = loadConfig(process.env);
const { db } = connect(config.databaseUrl);
await runMigrations(db);

const ingestions = createIngestionJobs({
  service: createIngestion(config.ingest, db),
  getRun: createPgIngestionRepository(db).getRun,
  newRun: () => ({
    window: ingestionWindow(new Date(), config.ingest.historyWeeks),
    maxRequests: config.ingest.maxRequests,
    maxTokens: config.ingest.maxTokens,
  }),
});

const root = new Hono().route('/', createApp({ probeDatabase: () => probe(db), ingestions }));

if (config.webDistDir) {
  const webRoot = config.webDistDir;
  root.use('/*', serveStatic({ root: webRoot }));
  // Single-page app: unknown non-API paths fall back to index.html.
  root.get('*', serveStatic({ root: webRoot, path: 'index.html' }));
}

serve({ fetch: root.fetch, port: config.port }, ({ port }) => {
  console.log(`community-voices api listening on http://localhost:${port}`);
});
