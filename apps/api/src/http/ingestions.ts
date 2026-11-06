import type { AcceptedResponse, ErrorResponse, IngestionRunResponse } from '@cv/contracts';
import { Hono } from 'hono';
import type { IngestionJobs } from '../ingest/ingestion-jobs';
import type { IngestionRun } from '../ingest/ingestion-run';

const inProgress: ErrorResponse = {
  error: 'ingestion_in_progress',
  message: 'An ingestion is already running; poll it instead of starting another',
};
const notFound: ErrorResponse = { error: 'not_found', message: 'No such ingestion run' };

const toResponse = ({
  window,
  doneTopicIds: _done,
  ...run
}: IngestionRun): IngestionRunResponse => ({
  ...run,
  windowStart: window.start.toISOString(),
  windowEnd: window.end.toISOString(),
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
