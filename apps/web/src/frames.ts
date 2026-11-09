import type { PostImage, PostMedia } from '@cv/contracts';

export interface Frame {
  postId: number;
  username: string;
  image: PostImage;
}

/**
 * Up to `max` images for a contact sheet: one per cited post first, in citation order, so a
 * single gallery post can't fill the strip; then each post's further images in turn.
 */
export const pickFrames = (ids: number[], media: Map<number, PostMedia>, max: number): Frame[] => {
  const posts = [...new Set(ids)].flatMap((id) => media.get(id) ?? []);
  const frames: Frame[] = [];
  for (let round = 0; frames.length < max; round++) {
    const row = posts.flatMap(({ postId, username, images }) => {
      const image = images[round];
      return image ? [{ postId, username, image }] : [];
    });
    if (row.length === 0) break;
    frames.push(...row.slice(0, max - frames.length));
  }
  return frames;
};
