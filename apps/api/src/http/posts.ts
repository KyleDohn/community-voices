import {
  type ErrorResponse,
  MAX_MEDIA_IDS,
  type PostMedia,
  type PostMediaResponse,
} from '@cv/contracts';
import { Hono } from 'hono';
import { z } from 'zod';

/** Author and images for each known post id; unknown ids are left out. */
export type PostMediaSource = (ids: number[]) => Promise<PostMedia[]>;

const Ids = z
  .string()
  .transform((s) => s.split(','))
  .pipe(
    z
      .array(z.string().regex(/^[1-9]\d*$/, 'a positive integer'))
      .min(1)
      .max(MAX_MEDIA_IDS),
  )
  .transform((ids) => [...new Set(ids.map(Number))]);

export const postRoutes = (media: PostMediaSource) =>
  new Hono().get('/media', async (c) => {
    const ids = Ids.safeParse(c.req.query('ids'));
    if (!ids.success) {
      const error: ErrorResponse = {
        error: 'invalid_request',
        message: `ids: ${z.prettifyError(ids.error)}`,
      };
      return c.json(error, 400);
    }
    return c.json({ posts: await media(ids.data) } satisfies PostMediaResponse);
  });
