import { z } from 'zod';
import { PostId } from './report';

/** An image the author uploaded, at the forum's own downsized resolution (ASSUMPTIONS #39). */
export const PostImage = z.object({
  url: z.string(),
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** `#RRGGBB` the forum computed; paints the frame while the image loads. */
  dominantColor: z.string().nullable(),
});
export type PostImage = z.infer<typeof PostImage>;

export const PostMedia = z.object({
  postId: PostId,
  username: z.string(),
  images: z.array(PostImage),
});
export type PostMedia = z.infer<typeof PostMedia>;

export const MAX_MEDIA_IDS = 100;

/** `GET /api/v1/posts/media?ids=1,2,3`: author and images per post; unknown ids are left out. */
export const PostMediaResponse = z.object({ posts: z.array(PostMedia) });
export type PostMediaResponse = z.infer<typeof PostMediaResponse>;
