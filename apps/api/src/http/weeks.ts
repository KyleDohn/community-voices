import type { WeekSummary, WeeksResponse } from '@cv/contracts';
import { Hono } from 'hono';

export const weekRoutes = (listWeeks: () => Promise<WeekSummary[]>) =>
  new Hono().get('/', async (c) => c.json({ weeks: await listWeeks() } satisfies WeeksResponse));
