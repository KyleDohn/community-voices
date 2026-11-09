import { z } from 'zod';
import { PostId } from './report';

/** One embedded chunk on the 2D map; several chunks of a long post share a post id. */
export const MapPoint = z.object({
  chunkId: z.number().int(),
  postId: PostId,
  x: z.number(),
  y: z.number(),
  /** Monday, `YYYY-MM-DD`. */
  weekStart: z.iso.date(),
  topicTitle: z.string(),
  postNumber: z.number().int(),
  url: z.string(),
  /** Distinct retrieval runs that picked the post, which sizes its outline (ASSUMPTIONS #35). */
  runs: z.number().int().nonnegative(),
});
export type MapPoint = z.infer<typeof MapPoint>;

export const MapStatus = z.enum(['computing', 'ready', 'failed']);
export type MapStatus = z.infer<typeof MapStatus>;

/** `GET /api/v1/embeddings/map?reportId=`: the UMAP projection and the report's source posts. */
export const MapResponse = z
  .object({
    status: MapStatus,
    points: z.array(MapPoint),
    highlightPostIds: z.array(PostId),
  })
  .refine((map) => map.status === 'ready' || map.points.length === 0, {
    message: 'points are only sent once the map is ready',
    path: ['points'],
  });
export type MapResponse = z.infer<typeof MapResponse>;
