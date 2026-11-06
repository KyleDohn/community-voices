import type { HealthResponse } from '@cv/contracts';
import { Hono } from 'hono';

const isReachable = (probe: () => Promise<boolean>) => probe().catch(() => false);

export const healthRoutes = (probeDatabase: () => Promise<boolean>) =>
  new Hono().get('/', async (c) => {
    const databaseUp = await isReachable(probeDatabase);
    const body: HealthResponse = {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
    };
    return c.json(body, databaseUp ? 200 : 503);
  });
