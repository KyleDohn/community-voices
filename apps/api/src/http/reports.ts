import {
  type AcceptedResponse,
  type ErrorResponse,
  type ReportListResponse,
  StartReportRequest,
  WeekStart,
} from '@cv/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ReportJobs } from '../generate/report-jobs';

const inProgress: ErrorResponse = {
  error: 'report_in_progress',
  message: 'A report is already being generated; poll it instead of starting another',
};
const unavailable: ErrorResponse = {
  error: 'llm_unavailable',
  message: 'No ANTHROPIC_API_KEY is set, so reports cannot be generated',
};
const notFound: ErrorResponse = { error: 'not_found', message: 'No such report run' };
const invalid = (error: z.ZodError): ErrorResponse => ({
  error: 'invalid_request',
  message: z.prettifyError(error),
});

export const reportRoutes = (jobs: ReportJobs) =>
  new Hono()
    .post('/', async (c) => {
      if (!jobs.canGenerate) return c.json(unavailable, 503);
      const body = StartReportRequest.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json(invalid(body.error), 400);
      const started = await jobs.trigger(body.data.week);
      if (!started) return c.json(inProgress, 409);
      return c.json({ id: started.id } satisfies AcceptedResponse, 202);
    })
    .get('/', async (c) => {
      const week = WeekStart.optional().safeParse(c.req.query('week'));
      if (!week.success) return c.json(invalid(week.error), 400);
      const runs = await jobs.list(week.data);
      const reports = runs.map(({ id, weekStart, status, createdAt, costUsd }) => ({
        id,
        weekStart,
        status,
        createdAt,
        costUsd,
      }));
      return c.json({ reports } satisfies ReportListResponse);
    })
    .get('/:id', async (c) => {
      const run = await jobs.get(c.req.param('id'));
      return run ? c.json(run) : c.json(notFound, 404);
    });
