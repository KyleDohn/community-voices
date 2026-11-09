import type { PostMedia, ReportSource } from '@cv/contracts';
import { useEffect, useState } from 'react';
import { fetchPostMedia } from './api';
import { pickFrames } from './frames';

/** Cited posts' authors and photos. Photos are decoration, so a failed fetch just shows none. */
export const usePostMedia = (ids: number[]) => {
  const [media, setMedia] = useState(new Map<number, PostMedia>());
  const key = [...new Set(ids)].join(',');

  useEffect(() => {
    if (!key) return;
    let current = true;
    fetchPostMedia(key.split(',').map(Number))
      .then(({ posts }) => current && setMedia(new Map(posts.map((p) => [p.postId, p]))))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [key]);

  return media;
};

interface Props {
  ids: number[];
  media: Map<number, PostMedia>;
  numbers: Map<number, number>;
  sources: Map<number, ReportSource>;
}

/** A strip of the community's own photos from a theme's posts, each linking to its post. */
export const ContactSheet = ({ ids, media, numbers, sources }: Props) => {
  const frames = pickFrames(ids, media, 4);
  if (frames.length === 0) return null;
  return (
    <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Photos from these posts">
      {frames.map(({ postId, username, image }) => (
        <li key={image.url}>
          <a
            href={sources.get(postId)?.url}
            target="_blank"
            rel="noreferrer"
            className="group block"
          >
            <span
              className="block aspect-[3/2] overflow-hidden rounded-sm"
              style={{ background: image.dominantColor ?? 'var(--color-rule)' }}
            >
              <img
                src={image.url}
                alt={image.alt || `Image from post ${postId}`}
                width={image.width}
                height={image.height}
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-opacity group-hover:opacity-85"
              />
            </span>
            <span className="exif mt-1.5 block truncate normal-case">
              <span className="text-accent">{numbers.get(postId)}</span> {username}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
};
