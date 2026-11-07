/**
 * `pnpm ingest` fetches four weeks of the configured Discourse forum into Postgres, then embeds it.
 * `pnpm ingest --resume <run-id>` continues a capped or failed run from its cursor.
 */
import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { connect, runMigrations } from '../db/client';
import { loadBgeEmbedder } from '../embed/bge-embedder';
import { embedPendingChunks } from '../embed/embed-pending';
import { createPgChunkRepository } from '../embed/pg-chunk-repository';
import type { ForumSource } from '../ingest/forum-source';
import { ingestionWindow } from '../ingest/week';
import { createIngestion } from '../ingest/wiring';

const { values } = parseArgs({ options: { resume: { type: 'string' } } });
const config = loadConfig(process.env);
const { pool, db } = connect(config.databaseUrl);
await runMigrations(db);

let total = 0;
let fetched = 0;
const withProgress = (source: ForumSource): ForumSource => ({
  listActiveTopics: async (since) => {
    const topics = await source.listActiveTopics(since);
    total = topics.length;
    console.log(`${total} topics active since ${since.toISOString().slice(0, 10)}`);
    return topics;
  },
  fetchTopic: async (id, window) => {
    const result = await source.fetchTopic(id, window);
    fetched++;
    if (fetched % 25 === 0) console.log(`  fetched ${fetched} topics (${total} listed)`);
    return result;
  },
});

const service = createIngestion(config.ingest, db, withProgress);
const caps = { maxRequests: config.ingest.maxRequests, maxTokens: config.ingest.maxTokens };
const runId =
  values.resume ??
  (
    await service.start({
      window: ingestionWindow(new Date(), config.ingest.historyWeeks),
      ...caps,
    })
  ).id;

console.log(`Ingestion run ${runId} from ${config.ingest.discourseBaseUrl}`);
// A resume takes the current caps, so raising INGEST_MAX_TOKENS lets a token-capped run continue.
const run = await service.ingest(runId, values.resume ? caps : undefined);
const { status, topicsStored, postsStored, chunksStored, tokensUsed, error } = run;
console.log({ status, topicsStored, postsStored, chunksStored, tokensUsed, error });
if (status === 'capped') {
  console.log(
    `Capped. Raise INGEST_MAX_REQUESTS or INGEST_MAX_TOKENS, then: pnpm ingest --resume ${runId}`,
  );
}
// Embed here too, so `pnpm run search` works without restarting the server.
const embedder = await loadBgeEmbedder(config.embedding);
const { embedded } = await embedPendingChunks(createPgChunkRepository(db), embedder, {
  batchSize: config.embedding.batchSize,
});
console.log(`Embedded ${embedded} chunk(s)`);
await pool.end();
process.exitCode = status === 'failed' ? 1 : 0;
