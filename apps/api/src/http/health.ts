import type { EmbedderStatus, HealthResponse } from '@cv/contracts';
import { Hono } from 'hono';

const isReachable = (probe: () => Promise<boolean>) => probe().catch(() => false);

export const healthRoutes = (
  probeDatabase: () => Promise<boolean>,
  embedderStatus: () => EmbedderStatus,
) =>
  new Hono().get('/', async (c) => {
    const databaseUp = await isReachable(probeDatabase);
    const embedder = embedderStatus();
    const healthy = databaseUp && embedder !== 'failed';
    const body: HealthResponse = {
      status: healthy ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      embedder,
    };
    return c.json(body, healthy ? 200 : 503);
  });
