import type { ForumPost, ForumTopic } from './forum-source';

export interface ChunkOptions {
  /** ~300 English words ≈ 400 tokens, under bge-small's 512-token input limit with the prefix. */
  maxWords: number;
  overlapWords: number;
  /** Replies shorter than this ("thanks!", "+1") add noise, not signal. */
  minWords: number;
}

export interface ChunkDraft {
  postId: number;
  chunkIndex: number;
  text: string;
}

const QUOTE = /\[quote[^\]]*\][\s\S]*?\[\/quote\]/gi;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;

/** Quotes repeat other posts and images carry no text, so neither should count or be embedded. */
const clean = (raw: string) => raw.replace(QUOTE, '').replace(IMAGE, '').trim();

const splitWords = (words: string[], { maxWords, overlapWords }: ChunkOptions) => {
  const pieces: string[] = [];
  for (let start = 0; ; start += maxWords - overlapWords) {
    pieces.push(words.slice(start, start + maxWords).join(' '));
    if (start + maxWords >= words.length) return pieces;
  }
};

/** One post becomes zero or more embeddable chunks, each headed by its topic for context. */
export const chunkPost = (
  post: ForumPost,
  topic: ForumTopic,
  options: ChunkOptions,
): ChunkDraft[] => {
  const text = clean(post.raw);
  const words = text.split(/\s+/).filter(Boolean);
  const isOpeningPost = post.postNumber === 1;
  if (!isOpeningPost && words.length < options.minWords) return [];

  const prefix = `${topic.title} [${topic.category}]`;
  const bodies = words.length <= options.maxWords ? [text] : splitWords(words, options);
  return bodies.map((body, chunkIndex) => ({
    postId: post.id,
    chunkIndex,
    text: body ? `${prefix}\n\n${body}` : prefix,
  }));
};
