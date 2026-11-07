import type { AcceptedResponse, ErrorResponse, IngestionRunResponse } from '@cv/contracts';
import { Hono } from 'hono';
import type { IngestionJobs } from '../ingest/ingestion-jobs';
import type { IngestionRun } from '../ingest/ingestion-run';

const inProgress: ErrorResponse = {
  error: 'ingestion_in_progress',
  message: 'An ingestion is already running; poll it instead of starting another',
};
const notFound: ErrorResponse = { error: 'not_found', message: 'No such ingestion run' };

// Field by field, so internal run state (like the cursor) can't leak into the response.
const toResponse = (run: IngestionRun): IngestionRunResponse => ({
  id: run.id,
  status: run.status,
  windowStart: run.window.start.toISOString(),
  windowEnd: run.window.end.toISOString(),
  maxRequests: run.maxRequests,
  maxTokens: run.maxTokens,
  topicsStored: run.topicsStored,
  postsStored: run.postsStored,
  chunksStored: run.chunksStored,
  tokensUsed: run.tokensUsed,
  error: run.error,
});

export const ingestionRoutes = (jobs: IngestionJobs) =>
  new Hono()
    .post('/', async (c) => {
      const started = await jobs.trigger();
      if (!started) return c.json(inProgress, 409);
      return c.json({ id: started.id } satisfies AcceptedResponse, 202);
    })
    .get('/:id', async (c) => {
      const run = await jobs.get(c.req.param('id'));
      return run ? c.json(toResponse(run)) : c.json(notFound, 404);
    });
