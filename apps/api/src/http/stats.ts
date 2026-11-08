import type { CostStatsResponse, ErrorResponse, RetrievalStatsResponse } from '@cv/contracts';
import { Hono } from 'hono';
import { z } from 'zod';

/** The stats queries with the facet ids already bound, so routes only pass the limit. */
export interface StatsSource {
  retrievals(limit: number): Promise<RetrievalStatsResponse>;
  costs(): Promise<CostStatsResponse>;
}

const Limit = z.coerce.number().int().min(1).max(100).default(20);

export const statsRoutes = (stats: StatsSource) =>
  new Hono()
    .get('/retrievals', async (c) => {
      // An empty `?limit=` would coerce to 0; reject it rather than read it as the default.
      const limit = Limit.safeParse(c.req.query('limit'));
      if (!limit.success) {
        const error: ErrorResponse = {
          error: 'invalid_request',
          message: `limit: ${z.prettifyError(limit.error)}`,
        };
        return c.json(error, 400);
      }
      return c.json(await stats.retrievals(limit.data));
    })
    .get('/costs', async (c) => c.json(await stats.costs()));
