import type { PostImage, PostMedia } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { pickFrames } from './frames';

const image = (alt: string): PostImage => ({
  url: `https://cdn.example/${alt}.jpeg`,
  alt,
  width: 690,
  height: 460,
  dominantColor: null,
});
const media = (postId: number, ...alts: string[]): PostMedia => ({
  postId,
  username: `user${postId}`,
  images: alts.map(image),
});
const byId = (...posts: PostMedia[]) => new Map(posts.map((p) => [p.postId, p]));
const alts = (frames: ReturnType<typeof pickFrames>) => frames.map((f) => f.image.alt);

describe('pickFrames', () => {
  it('takes one image per post first, in citation order', () => {
    const posts = byId(media(1, 'a1', 'a2'), media(2, 'b1'), media(3, 'c1'));
    expect(alts(pickFrames([3, 1, 2], posts, 3))).toEqual(['c1', 'a1', 'b1']);
  });

  it('fills the remaining frames with further images when posts run out', () => {
    const posts = byId(media(1, 'a1', 'a2', 'a3'), media(2, 'b1', 'b2'));
    expect(alts(pickFrames([1, 2], posts, 4))).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('skips posts with no images or no media, and repeated ids', () => {
    const posts = byId(media(1), media(2, 'b1'));
    const frames = pickFrames([1, 2, 2, 9], posts, 4);
    expect(frames).toEqual([{ postId: 2, username: 'user2', image: image('b1') }]);
  });
});
