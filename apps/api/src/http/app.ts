import type { ErrorResponse } from '@cv/contracts';
import { Hono } from 'hono';
import { healthRoutes } from './health';

export interface AppDependencies {
  /** Resolves true when the database answers a trivial query. */
  probeDatabase: () => Promise<boolean>;
}

export const API_PREFIX = '/api/v1';

const notFound: ErrorResponse = { error: 'not_found', message: 'No such API route' };

export const createApp = (deps: AppDependencies) =>
  new Hono()
    .basePath(API_PREFIX)
    .route('/health', healthRoutes(deps.probeDatabase))
    // Catch-all so unknown API paths never fall through to the web app's index.html.
    .all('/*', (c) => c.json(notFound, 404));
