/**
 * `pnpm run retrieve` runs the RAG retrieval for the latest complete week: each facet's MMR picks,
 * merged and logged as a retrieval run, then each facet's trend over the prior weeks.
 * `--week 2026-10-19` picks another week.
 */
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadConfig } from '../config';
import { connect, runMigrations } from '../db/client';
import { loadBgeEmbedder } from '../embed/bge-embedder';
import { createPgChunkRepository } from '../embed/pg-chunk-repository';
import { priorWeeks } from '../ingest/week';
import { FACETS } from '../retrieve/facets';
import { createPgRetrievalLog } from '../retrieve/pg-retrieval-log';
import { retrieveWeek, toLogEntries } from '../retrieve/retrieve-week';
import { trendLogEntries, trendLookup } from '../retrieve/trend-lookup';
import { isoDay, WeekArg } from './week-arg';

const { values } = parseArgs({ options: { week: { type: 'string' } } });
const parsed = z.object({ week: WeekArg }).safeParse(values);
if (!parsed.success) {
  console.error(z.prettifyError(parsed.error));
  console.error('Usage: pnpm run retrieve [--week YYYY-MM-DD (a Monday)]');
  process.exit(2);
}
const { week } = parsed.data;

const config = loadConfig(process.env);
const { pool, db } = connect(config.databaseUrl);
await runMigrations(db);
const deps = {
  embedder: await loadBgeEmbedder(config.embedding),
  search: createPgChunkRepository(db),
};
const { retrieval } = config;

const chunks = await retrieveWeek(deps, { week, facets: FACETS, ...retrieval });
if (chunks.length === 0) {
  console.error(
    `No embedded chunks in the week of ${week}; nothing logged. GET /api/v1/weeks lists the weeks with data.`,
  );
  await pool.end();
  process.exit(1);
}

// The demo uses facet queries as themes; phase 4 passes the LLM's themes instead.
const prior = priorWeeks({ start: new Date(week), end: new Date(week) }, config.ingest.historyWeeks)
  .map((w) => isoDay(w.start))
  .reverse();
const trends = await trendLookup(deps, {
  week,
  priorWeeks: prior,
  themes: FACETS.map((f) => f.query),
  poolSize: retrieval.trendPoolSize,
  examplesPerWeek: retrieval.trendExamplesPerWeek,
});

const entries = [...toLogEntries(chunks), ...trendLogEntries(trends)];
const runId = await createPgRetrievalLog(db).record(week, entries);
console.log(
  `Week of ${week}: ${chunks.length} chunks, ${entries.length} log rows (run ${runId})\n`,
);

for (const facet of FACETS) {
  console.log(`## ${facet.label}`);
  const found = chunks
    .map((c) => ({ ...c, match: c.facets.find((f) => f.facetId === facet.id)! }))
    .filter((c) => c.match)
    .sort((a, b) => a.match.rank - b.match.rank);
  for (const { match, facets, topicTitle, url, text } of found) {
    const others = facets.filter((f) => f !== match).map((f) => f.facetId);
    const also = others.length > 0 ? `  (also: ${others.join(', ')})` : '';
    const snippet = text.replace(/\s+/g, ' ').slice(0, 140);
    console.log(
      `${match.rank}. ${match.score.toFixed(3)}  ${topicTitle}${also}\n   ${url}\n   ${snippet}…`,
    );
  }
  console.log();
}

console.log(`## Trends: share of each theme's ${retrieval.trendPoolSize} nearest chunks, by week`);
trends.forEach((trend, i) => {
  const counts = trend.weeks.map((w) => `${w.weekStart} ${String(w.matches).padStart(2)}`);
  console.log(`${FACETS[i]!.label.padEnd(38)} ${counts.join('   ')}`);
});
await pool.end();
