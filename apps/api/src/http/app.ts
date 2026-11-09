import type { EmbedderStatus, ErrorResponse, WeekSummary } from '@cv/contracts';
import { Hono } from 'hono';
import type { AbJobs } from '../ab/ab-jobs';
import type { ReportJobs } from '../generate/report-jobs';
import type { IngestionJobs } from '../ingest/ingestion-jobs';
import { abRunRoutes } from './ab-runs';
import { healthRoutes } from './health';
import { ingestionRoutes } from './ingestions';
import { type MapSource, mapRoutes } from './map';
import { type PostMediaSource, postRoutes } from './posts';
import { reportRoutes } from './reports';
import { type StatsSource, statsRoutes } from './stats';
import { weekRoutes } from './weeks';

export interface AppDependencies {
  /** Resolves true when the database answers a trivial query. */
  probeDatabase: () => Promise<boolean>;
  embedderStatus: () => EmbedderStatus;
  ingestions: IngestionJobs;
  /** Weeks that have chunks, newest first. */
  listWeeks: () => Promise<WeekSummary[]>;
  reports: ReportJobs;
  abRuns: AbJobs;
  stats: StatsSource;
  map: MapSource;
  media: PostMediaSource;
}

export const API_PREFIX = '/api/v1';

const notFound: ErrorResponse = { error: 'not_found', message: 'No such API route' };
const internal: ErrorResponse = { error: 'internal', message: 'Unexpected server error' };

export const createApp = (deps: AppDependencies) =>
  new Hono()
    .basePath(API_PREFIX)
    .route('/health', healthRoutes(deps.probeDatabase, deps.embedderStatus))
    .route('/ingestions', ingestionRoutes(deps.ingestions))
    .route('/weeks', weekRoutes(deps.listWeeks))
    .route('/reports', reportRoutes(deps.reports))
    .route('/ab-runs', abRunRoutes(deps.abRuns))
    .route('/stats', statsRoutes(deps.stats))
    .route('/embeddings', mapRoutes(deps.map))
    .route('/posts', postRoutes(deps.media))
    // Catch-all so unknown API paths never fall through to the web app's index.html.
    .all('/*', (c) => c.json(notFound, 404))
    // Non-2xx bodies are always ErrorResponse; details go to the log, not the client.
    .onError((error, c) => {
      console.error(error);
      return c.json(internal, 500);
    });
