import {
  type AbRunListResponse,
  type AcceptedResponse,
  type ErrorResponse,
  StartAbRunRequest,
} from '@cv/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AbJobs } from '../ab/ab-jobs';

const inProgress: ErrorResponse = {
  error: 'ab_run_in_progress',
  message: 'An A/B run is already in progress; poll it instead of starting another',
};
const unavailable: ErrorResponse = {
  error: 'llm_unavailable',
  message: 'No ANTHROPIC_API_KEY is set, so A/B runs cannot be started',
};
const notFound: ErrorResponse = { error: 'not_found', message: 'No such A/B run' };
const invalid = (error: z.ZodError): ErrorResponse => ({
  error: 'invalid_request',
  message: z.prettifyError(error),
});

export const abRunRoutes = (jobs: AbJobs) =>
  new Hono()
    .post('/', async (c) => {
      if (!jobs.canGenerate) return c.json(unavailable, 503);
      const body = StartAbRunRequest.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json(invalid(body.error), 400);
      const started = await jobs.trigger(body.data.week);
      if (!started) return c.json(inProgress, 409);
      return c.json({ id: started.id } satisfies AcceptedResponse, 202);
    })
    .get('/', async (c) => {
      const runs = await jobs.list();
      const abRuns = runs.map(({ id, weekStart, status, createdAt, costUsd, isSample }) => ({
        id,
        weekStart,
        status,
        createdAt,
        costUsd,
        isSample,
      }));
      return c.json({ abRuns } satisfies AbRunListResponse);
    })
    .get('/:id', async (c) => {
      const run = await jobs.get(c.req.param('id'));
      return run ? c.json(run) : c.json(notFound, 404);
    });
