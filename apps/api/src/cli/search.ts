/**
 * `pnpm search "export crash"` prints the chunks closest to a query in the latest complete week.
 * `--week 2026-10-19` picks another week, `--k 5` the number of hits.
 */
import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { connect } from '../db/client';
import { loadBgeEmbedder } from '../embed/bge-embedder';
import { createPgChunkRepository } from '../embed/pg-chunk-repository';
import { targetWeek } from '../ingest/week';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { week: { type: 'string' }, k: { type: 'string', default: '10' } },
});
const query = positionals.join(' ').trim();
if (!query) {
  console.error('Usage: pnpm search "<query>" [--week YYYY-MM-DD] [--k 10]');
  process.exit(2);
}

const config = loadConfig(process.env);
const { pool, db } = connect(config.databaseUrl);
const weekStart = values.week ?? targetWeek(new Date()).start.toISOString().slice(0, 10);
const embedder = await loadBgeEmbedder(config.embedding);
const hits = await createPgChunkRepository(db).search({
  model: embedder.model,
  weekStart,
  vector: await embedder.embedQuery(query),
  k: Number(values.k),
});

console.log(`"${query}" in the week of ${weekStart}: ${hits.length} hit(s)\n`);
for (const { score, topicTitle, url, text } of hits) {
  const snippet = text.replace(/\s+/g, ' ').slice(0, 160);
  console.log(`${score.toFixed(3)}  ${topicTitle}\n       ${url}\n       ${snippet}…\n`);
}
await pool.end();
