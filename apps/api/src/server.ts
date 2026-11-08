import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { loadConfig } from './config';
import { connect, probe, runMigrations } from './db/client';
import { loadBgeEmbedder } from './embed/bge-embedder';
import { createEmbeddingWorker } from './embed/embedding-worker';
import { createPgChunkRepository } from './embed/pg-chunk-repository';
import { createAnthropicLlmClient } from './generate/anthropic-llm-client';
import { createAbJobs } from './ab/ab-jobs';
import { createPgAbRunRepository } from './ab/pg-ab-run-repository';
import { createPgCorpus } from './ab/pg-corpus';
import { runAb } from './ab/run-ab';
import { createPgReportRepository } from './generate/pg-report-repository';
import { createReportJobs } from './generate/report-jobs';
import { createReportGenerator } from './generate/wiring';
import { createApp } from './http/app';
import { createIngestionJobs } from './ingest/ingestion-jobs';
import { createPgIngestionRepository } from './ingest/pg-ingestion-repository';
import { ingestionWindow } from './ingest/week';
import { latestSeedFile, seedIfEmpty } from './seed/seed';
import { createIngestion } from './ingest/wiring';

const config = loadConfig(process.env);
const { db } = connect(config.databaseUrl);
await runMigrations(db);

const ingestionRepo = createPgIngestionRepository(db);
const interrupted = await ingestionRepo.failInterruptedRuns();
if (interrupted > 0) console.log(`Marked ${interrupted} interrupted ingestion run(s) as failed`);

const seedFile = await latestSeedFile(config.ingest.discourseBaseUrl);
if (seedFile) {
  const outcome = await seedIfEmpty(ingestionRepo, seedFile, config.ingest.chunk);
  console.log(`Seed ${seedFile}: ${outcome}`);
}

const chunkRepo = createPgChunkRepository(db);
// The model loads in the background so the API answers while boot embeds the seed.
const embedding = createEmbeddingWorker(() => loadBgeEmbedder(config.embedding), chunkRepo, {
  batchSize: config.embedding.batchSize,
});
const embedPending = async () => {
  const started = Date.now();
  const { embedded } = await embedding.embedPending();
  if (embedded > 0) console.log(`Embedded ${embedded} chunk(s) in ${Date.now() - started} ms`);
};
embedPending().catch((error: unknown) => console.error('Embedding failed', error));

const ingestions = createIngestionJobs({
  service: createIngestion(config.ingest, db),
  getRun: ingestionRepo.getRun,
  newRun: () => ({
    window: ingestionWindow(new Date(), config.ingest.historyWeeks),
    maxRequests: config.ingest.maxRequests,
    maxTokens: config.ingest.maxTokens,
  }),
  afterRun: embedPending,
});

const reportRepo = createPgReportRepository(db);
const interruptedReports = await reportRepo.failInterruptedRuns();
if (interruptedReports > 0)
  console.log(`Marked ${interruptedReports} interrupted report run(s) as failed`);

const abRepo = createPgAbRunRepository(db);
const interruptedAbRuns = await abRepo.failInterruptedRuns();
if (interruptedAbRuns > 0)
  console.log(`Marked ${interruptedAbRuns} interrupted A/B run(s) as failed`);

const { anthropicApiKey } = config;
const llm = anthropicApiKey ? createAnthropicLlmClient({ apiKey: anthropicApiKey }) : undefined;
const generate = llm && createReportGenerator(config, db, embedding.embedder, llm);
const noKey = () => Promise.reject(new Error('No ANTHROPIC_API_KEY'));

const reports = createReportJobs({
  repo: reportRepo,
  canGenerate: generate !== undefined,
  generate: generate ? (week) => generate(week) : noKey,
});

const corpus = createPgCorpus(db);
const abRuns = createAbJobs({
  repo: abRepo,
  reports: reportRepo,
  canGenerate: generate !== undefined,
  run:
    llm && generate
      ? (week, options) =>
          runAb({ llm, config: config.llm, generateReport: generate, corpus }, week, options)
      : noKey,
});

const root = new Hono().route(
  '/',
  createApp({
    probeDatabase: () => probe(db),
    embedderStatus: embedding.status,
    ingestions,
    listWeeks: () => chunkRepo.listWeeks(config.embedding.model),
    reports,
    abRuns,
  }),
);

if (config.webDistDir) {
  const webRoot = config.webDistDir;
  root.use('/*', serveStatic({ root: webRoot }));
  // Single-page app: unknown non-API paths fall back to index.html.
  root.get('*', serveStatic({ root: webRoot, path: 'index.html' }));
}

serve({ fetch: root.fetch, port: config.port }, ({ port }) => {
  console.log(`community-voices api listening on http://localhost:${port}`);
});
