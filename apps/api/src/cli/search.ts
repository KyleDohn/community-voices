/**
 * `pnpm run search "export crash"` prints the chunks closest to a query in the latest complete week.
 * `--week 2026-10-19` picks another week, `--k 5` the number of hits.
 */
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadConfig } from '../config';
import { connect } from '../db/client';
import { loadBgeEmbedder } from '../embed/bge-embedder';
import { createPgChunkRepository } from '../embed/pg-chunk-repository';
import { WeekArg } from './week-arg';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { week: { type: 'string' }, k: { type: 'string', default: '10' } },
});
const Args = z.object({
  query: z.string().trim().min(1),
  week: WeekArg,
  k: z.coerce.number().int().positive(),
});
const parsed = Args.safeParse({ query: positionals.join(' '), week: values.week, k: values.k });
if (!parsed.success) {
  console.error(z.prettifyError(parsed.error));
  console.error('Usage: pnpm run search "<query>" [--week YYYY-MM-DD (a Monday)] [--k 10]');
  process.exit(2);
}
const { query, week: weekStart, k } = parsed.data;

const config = loadConfig(process.env);
const { pool, db } = connect(config.databaseUrl);
const embedder = await loadBgeEmbedder(config.embedding);
const hits = await createPgChunkRepository(db).search({
  model: embedder.model,
  weekStart,
  vector: await embedder.embedQuery(query),
  k,
});

console.log(`"${query}" in the week of ${weekStart}: ${hits.length} hit(s)\n`);
for (const { score, topicTitle, url, text } of hits) {
  const snippet = text.replace(/\s+/g, ' ').slice(0, 160);
  console.log(`${score.toFixed(3)}  ${topicTitle}\n       ${url}\n       ${snippet}…\n`);
}
await pool.end();
