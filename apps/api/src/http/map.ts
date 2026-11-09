import type { ErrorResponse, MapPoint, MapResponse, MapStatus, PostId } from '@cv/contracts';
import { Hono } from 'hono';
import { z } from 'zod';

export interface MapSource {
  status(): MapStatus;
  points(): Promise<MapPoint[]>;
  /** The posts a report was written from; undefined when there is no such report. */
  reportPostIds(reportId: string): Promise<PostId[] | undefined>;
}

const ReportId = z.uuid().optional();
const unknownReport: ErrorResponse = { error: 'report_not_found', message: 'No such report run' };

export const mapRoutes = (map: MapSource) =>
  new Hono().get('/map', async (c) => {
    const reportId = ReportId.safeParse(c.req.query('reportId'));
    if (!reportId.success) {
      const error: ErrorResponse = {
        error: 'invalid_request',
        message: `reportId: ${z.prettifyError(reportId.error)}`,
      };
      return c.json(error, 400);
    }
    const highlightPostIds = reportId.data ? await map.reportPostIds(reportId.data) : [];
    if (!highlightPostIds) return c.json(unknownReport, 404);
    const status = map.status();
    const points = status === 'ready' ? await map.points() : [];
    return c.json({ status, points, highlightPostIds } satisfies MapResponse);
  });
