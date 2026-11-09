import type { ReportSource } from '@cv/contracts';
import { useEffect, useId, useRef, useState } from 'react';
import { footnoteLabel } from './footnotes';
import { weekRange } from './format';

interface FootnoteProps {
  ids: number[];
  numbers: Map<number, number>;
  sources: Map<number, ReportSource>;
  week: string;
}

/** One superscript per paragraph; the card names each post, since the schema cites per section. */
export const Footnote = ({ ids, numbers, sources, week }: FootnoteProps) => {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const cardId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  if (ids.length === 0) return <span className="exif ml-2 whitespace-nowrap">No posts cited</span>;

  const unique = [...new Set(ids)].sort((a, b) => numbers.get(a)! - numbers.get(b)!);
  const label = footnoteLabel(unique.map((id) => numbers.get(id)!));

  const toggle = () => {
    // A footnote near the right edge opens its card leftward, so it stays on screen.
    const rect = ref.current?.getBoundingClientRect();
    setAlignRight(rect !== undefined && rect.left > window.innerWidth / 2);
    setOpen(!open);
  };

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={cardId}
        aria-label={`Sources ${label}`}
        className="ml-0.5 rounded-sm px-0.5 align-super font-mono text-[0.62em] leading-none font-medium text-accent hover:bg-accent-soft aria-expanded:bg-accent-soft"
      >
        {label}
      </button>
      {open && (
        <span
          id={cardId}
          role="group"
          aria-label="Cited posts"
          className={`absolute top-full z-20 mt-2 block max-h-96 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border whitespace-normal border-rule bg-panel py-1 text-left font-sans text-sm leading-normal font-normal tracking-normal text-ink shadow-xl ${alignRight ? 'right-0' : 'left-0'}`}
        >
          {unique.map((id) => (
            <SourceRow key={id} id={id} n={numbers.get(id)!} source={sources.get(id)} week={week} />
          ))}
        </span>
      )}
    </span>
  );
};

interface RowProps {
  id: number;
  n: number;
  source: ReportSource | undefined;
  week: string;
}

const SourceRow = ({ id, n, source, week }: RowProps) => (
  <span className="block border-b border-rule px-4 py-3 last:border-b-0">
    <span className="exif flex justify-between gap-3">
      <span>
        <span className="text-accent">{n}</span> #{id}
      </span>
      {source && (
        <span>{source.weekStart === week ? 'this week' : weekRange(source.weekStart)}</span>
      )}
    </span>
    {source ? (
      <>
        <span className="mt-1 block font-semibold text-balance">{source.topicTitle}</span>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block font-medium text-accent hover:underline"
        >
          Open on discuss.pixls.us →
        </a>
      </>
    ) : (
      <span className="mt-1 block text-mid">Not among the posts the writer saw.</span>
    )}
  </span>
);
