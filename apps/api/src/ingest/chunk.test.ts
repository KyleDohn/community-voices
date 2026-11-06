import { describe, expect, it } from 'vitest';
import { chunkPost } from './chunk';
import type { ForumPost, ForumTopic } from './forum-source';

const topic: ForumTopic = {
  id: 7,
  title: 'darktable 5.4 released',
  category: 'Software / darktable',
  url: 'https://discuss.pixls.us/t/darktable-5-4-released/7',
  createdAt: new Date('2026-11-03T10:00:00Z'),
};

const post = (raw: string, postNumber = 2): ForumPost => ({
  id: 100 + postNumber,
  topicId: topic.id,
  postNumber,
  username: 'someone',
  raw,
  createdAt: new Date('2026-11-03T12:00:00Z'),
  url: `${topic.url}/${postNumber}`,
});

const words = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => `w${from + i}`).join(' ');

const options = { maxWords: 300, overlapWords: 40, minWords: 15 };
const prefix = 'darktable 5.4 released [Software / darktable]\n\n';

describe('chunkPost', () => {
  it('turns a normal post into one chunk headed by the topic title and category', () => {
    const body =
      'The new color equalizer finally fixes the skin tone shift I kept seeing on export.';

    expect(chunkPost(post(body), topic, options)).toEqual([
      { postId: 102, chunkIndex: 0, text: prefix + body },
    ]);
  });

  it('drops a reply under the word floor', () => {
    expect(chunkPost(post('Thanks, that worked!'), topic, options)).toEqual([]);
  });

  it('keeps a short opening post, because it frames the whole topic', () => {
    expect(chunkPost(post('New release is out.', 1), topic, options)).toHaveLength(1);
  });

  it('keeps an image-only opening post as its title, so the topic is still findable', () => {
    const raw = '![raw file|690x460](upload://fern.jpeg)';

    expect(chunkPost(post(raw, 1), topic, options)).toEqual([
      { postId: 101, chunkIndex: 0, text: prefix.trim() },
    ]);
  });

  it('splits a long post into overlapping chunks', () => {
    const chunks = chunkPost(post(words(700)), topic, options);

    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
    expect(chunks[0]?.text).toBe(prefix + words(300, 0));
    expect(chunks[1]?.text).toBe(prefix + words(300, 260));
    expect(chunks[2]?.text).toBe(prefix + words(180, 520));
  });

  it('strips quoted replies and image embeds before counting words', () => {
    const raw = [
      '[quote="other, post:1, topic:7"]',
      words(50),
      '[/quote]',
      '![screenshot|690x460](upload://abc123.jpeg)',
      'Same here, thanks.',
    ].join('\n');

    expect(chunkPost(post(raw), topic, options)).toEqual([]);
  });
});
