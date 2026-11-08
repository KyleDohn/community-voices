import type { Config } from '../config';
import type { Database } from '../db/client';
import type { Embedder } from '../embed/embedder';
import { createPgChunkRepository } from '../embed/pg-chunk-repository';
import { priorWeeks } from '../ingest/week';
import { FACETS } from '../retrieve/facets';
import { createPgRetrievalLog } from '../retrieve/pg-retrieval-log';
import { retrieveWeek } from '../retrieve/retrieve-week';
import { trendLookup } from '../retrieve/trend-lookup';
import { generateReport, type Retrieval } from './generate-report';
import type { LlmClient } from './llm-client';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The prior weeks' Mondays, newest first, as trendLookup expects. */
const priorWeekStarts = (week: string, count: number) =>
  priorWeeks({ start: new Date(week), end: new Date(week) }, count)
    .map((w) => isoDay(w.start))
    .reverse();

/** Binds generateReport to Postgres, the shared embedder and the facet config. */
export const createReportGenerator = (
  config: Config,
  db: Database,
  embedder: Promise<Embedder>,
  llm: LlmClient,
) => {
  const search = createPgChunkRepository(db);
  const { retrieval: options } = config;
  const retrieval: Retrieval = {
    retrieve: async (week) =>
      retrieveWeek({ embedder: await embedder, search }, { week, facets: FACETS, ...options }),
    trends: async (week, themes) =>
      trendLookup(
        { embedder: await embedder, search },
        {
          week,
          priorWeeks: priorWeekStarts(week, config.ingest.historyWeeks),
          themes,
          poolSize: options.trendPoolSize,
          examplesPerWeek: options.trendExamplesPerWeek,
        },
      ),
    poolSize: options.trendPoolSize,
  };
  const log = createPgRetrievalLog(db);
  return (week: string) => generateReport({ retrieval, log, llm, config: config.llm }, week);
};
