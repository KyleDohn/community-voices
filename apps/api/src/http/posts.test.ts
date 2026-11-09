import { ErrorResponse, MAX_MEDIA_IDS, type PostMedia, PostMediaResponse } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { testDependencies } from './testing/test-dependencies';

const stored: PostMedia[] = [
  {
    postId: 460890,
    username: 'someone',
    images: [
      {
        url: 'https://cdn.example/a_2_690x455.jpeg',
        alt: 'frame13',
        width: 690,
        height: 455,
        dominantColor: '#756A55',
      },
    ],
  },
  { postId: 463229, username: 'another', images: [] },
];

const get = async (query: string) => {
  const asked: number[][] = [];
  const app = createApp(
    testDependencies({
      media: async (ids) => {
        asked.push(ids);
        return stored.filter((p) => ids.includes(p.postId));
      },
    }),
  );
  const res = await app.request(`/api/v1/posts/media${query}`);
  return { res, body: (await res.json()) as unknown, asked };
};

describe('GET /posts/media', () => {
  it('returns author and images for the known ids, leaving out unknown ones', async () => {
    const { res, body } = await get('?ids=460890,463229,999');
    expect(res.status).toBe(200);
    expect(PostMediaResponse.parse(body)).toEqual({ posts: stored });
  });

  it('asks the store once per distinct id', async () => {
    const { asked } = await get('?ids=463229,463229,460890');
    expect(asked).toEqual([[463229, 460890]]);
  });

  it.each([
    ['no ids', ''],
    ['an empty list', '?ids='],
    ['a non-number', '?ids=12,abc'],
    ['a negative id', '?ids=-4'],
    [
      'too many ids',
      `?ids=${Array.from({ length: MAX_MEDIA_IDS + 1 }, (_, i) => i + 1).join(',')}`,
    ],
  ])('rejects %s with 400', async (_, query) => {
    const { res, body, asked } = await get(query);
    expect(res.status).toBe(400);
    expect(ErrorResponse.parse(body).error).toBe('invalid_request');
    expect(asked).toEqual([]);
  });

  it(`accepts exactly ${MAX_MEDIA_IDS} ids`, async () => {
    const ids = Array.from({ length: MAX_MEDIA_IDS }, (_, i) => i + 1).join(',');
    const { res } = await get(`?ids=${ids}`);
    expect(res.status).toBe(200);
  });
});
