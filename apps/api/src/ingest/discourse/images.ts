import type { PostImage } from '@cv/contracts';

/** Enough for a contact sheet; a 30-shot gallery post shouldn't bloat the row or the seed. */
export const MAX_IMAGES_PER_POST = 8;

const IMG = /<img\b[^>]*>/gi;
const ENTITIES: Record<string, string> = { amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' };

const attr = (tag: string, name: string) =>
  tag
    .match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1]
    ?.replace(/&(amp|quot|#39|lt|gt);/g, (_, e: string) => ENTITIES[e]!);

/**
 * Uploaded images from Discourse's rendered HTML. Only uploads carry `data-base62-sha1`, which
 * leaves out emoji, onebox previews and avatars; `src` is the forum's downsized copy.
 */
export const imagesFromCooked = (cooked: string): PostImage[] =>
  (cooked.match(IMG) ?? [])
    .flatMap((tag) => {
      const src = attr(tag, 'src');
      const width = Number(attr(tag, 'width'));
      const height = Number(attr(tag, 'height'));
      if (!attr(tag, 'data-base62-sha1') || !src || !(width > 0) || !(height > 0)) return [];
      const color = attr(tag, 'data-dominant-color');
      return [
        {
          url: src.startsWith('//') ? `https:${src}` : src,
          alt: attr(tag, 'alt') ?? '',
          width,
          height,
          dominantColor: color ? `#${color}` : null,
        },
      ];
    })
    .slice(0, MAX_IMAGES_PER_POST);
