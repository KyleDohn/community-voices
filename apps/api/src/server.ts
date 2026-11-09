import { serveStatic } from '@hono/node-server/serve-static';
import { startServer } from './http/start-server';
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
import { loadSampleIfEmpty } from './ab/sample-run';
import { createPgReportRepository } from './generate/pg-report-repository';
import { createReportJobs } from './generate/report-jobs';
import { createReportGenerator } from './generate/wiring';
import { createApp } from './http/app';
import { createIngestionJobs } from './ingest/ingestion-jobs';
import { createPgIngestionRepository } from './ingest/pg-ingestion-repository';
import { ingestionWindow } from './ingest/week';
import { FACETS } from './retrieve/facets';
import { latestSeedFile, seedIfEmpty } from './seed/seed';
import { createPgStatsRepository } from './stats/pg-stats-repository';
import { createIngestion } from './ingest/wiring';
import { createMapProjector } from './map/map-projector';
import { createPgMapStore } from './map/pg-map-store';
import { projectVectors } from './map/project-vectors';

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
const mapProjector = createMapProjector({
  store: createPgMapStore(db),
  project: projectVectors,
  model: config.embedding.model,
});
const refreshMap = async () => {
  const started = Date.now();
  await mapProjector.refresh();
  console.log(`Embeddings map ready in ${Date.now() - started} ms`);
};
// The map follows the embedded corpus, so it refreshes after every pass, even a failed one.
const embedPending = async () => {
  const started = Date.now();
  try {
    const { embedded } = await embedding.embedPending();
    if (embedded > 0) console.log(`Embedded ${embedded} chunk(s) in ${Date.now() - started} ms`);
  } finally {
    refreshMap().catch((error: unknown) => console.error('Embeddings map failed', error));
  }
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
console.log(`Sample A/B run: ${await loadSampleIfEmpty(db)}`);

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

const statsRepo = createPgStatsRepository(db);
const facetIds = FACETS.map((f) => f.id);

const root = new Hono().route(
  '/',
  createApp({
    probeDatabase: () => probe(db),
    embedderStatus: embedding.status,
    ingestions,
    listWeeks: () => chunkRepo.listWeeks(config.embedding.model),
    reports,
    abRuns,
    stats: {
      retrievals: (limit) => statsRepo.mostRetrievedPosts({ limit, facetIds }),
      costs: statsRepo.runCosts,
    },
    map: {
      status: mapProjector.status,
      points: mapProjector.points,
      reportPostIds: async (id) => (await reportRepo.getRun(id))?.sources.map((s) => s.postId),
    },
  }),
);

if (config.webDistDir) {
  const webRoot = config.webDistDir;
  root.use('/*', serveStatic({ root: webRoot }));
  // Single-page app: unknown non-API paths fall back to index.html.
  root.get('*', serveStatic({ root: webRoot, path: 'index.html' }));
}

const { port } = await startServer(root.fetch, config.port);
console.log(`community-voices api listening on http://localhost:${port}`);
