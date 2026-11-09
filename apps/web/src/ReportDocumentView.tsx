import type { Confidence, ReportDocument, ReportSource } from '@cv/contracts';
import type { ReactNode } from 'react';
import { ContactSheet, usePostMedia } from './ContactSheet';
import { Footnote } from './Footnote';
import { numberSources } from './footnotes';
import { weekRange } from './format';

const LEVELS: Confidence[] = ['low', 'medium', 'high'];

/** Three stops, like an exposure scale: how far the evidence carries the claim. */
const ConfidenceScale = ({ level }: { level: Confidence }) => (
  <span className="exif inline-flex items-center gap-2">
    <span className="flex gap-0.5" aria-hidden>
      {LEVELS.map((l, i) => (
        <span
          key={l}
          className={`h-2 w-4 rounded-[1px] ${i <= LEVELS.indexOf(level) ? 'bg-ink' : 'bg-rule'}`}
        />
      ))}
    </span>
    {level} confidence
  </span>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-12">
    <h2 className="exif font-medium">{title}</h2>
    <div className="mt-2">{children}</div>
  </section>
);

const Empty = () => (
  <p className="border-t border-rule pt-4 text-mid italic">Nothing the posts could support.</p>
);

/** A ruled row with a margin marker, like a frame on a contact sheet. */
const Frame = ({ marker, children }: { marker: string; children: ReactNode }) => (
  <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 border-t border-rule py-6">
    <span className="pt-1.5 font-mono text-xs text-accent" aria-hidden>
      {marker}
    </span>
    <div>{children}</div>
  </li>
);

const frame = (i: number) => String(i + 1).padStart(2, '0');

interface Props {
  document: ReportDocument;
  sources: ReportSource[];
  week: string;
}

export const ReportDocumentView = ({ document, sources, week }: Props) => {
  const byId = new Map(sources.map((s) => [s.postId, s]));
  const numbers = numberSources([
    document.mood.citations,
    ...document.themes.map((t) => t.citations),
    ...document.notableThreads.map((t) => t.citations),
    ...document.predictions.map((p) => p.citations),
  ]);
  const media = usePostMedia([...numbers.keys()]);
  // The last word and its footnote never part across a line break.
  const withFootnote = (text: string, ids: number[]) => {
    const cut = text.trimEnd().lastIndexOf(' ') + 1;
    return (
      <>
        {text.slice(0, cut)}
        <span className="whitespace-nowrap">
          {text.slice(cut).trimEnd()}
          <Footnote ids={ids} numbers={numbers} sources={byId} media={media} week={week} />
        </span>
      </>
    );
  };
  const cited = (ids: number[]) => new Set(ids).size;

  return (
    <article className="font-serif">
      <p className="exif">
        {weekRange(week)} · {numbers.size} posts cited
      </p>
      <p className="mt-3 text-2xl leading-snug text-pretty">
        {withFootnote(document.mood.summary, document.mood.citations)}
      </p>

      <Section title="What people talked about">
        {document.themes.length === 0 ? (
          <Empty />
        ) : (
          <ol>
            {document.themes.map((t, i) => (
              <Frame key={i} marker={frame(i)}>
                <h3 className="text-xl font-semibold text-balance">{t.title}</h3>
                <p className="exif mt-1.5">
                  ≈{t.approxPostCount} posts · {cited(t.citations)} cited
                </p>
                <p className="mt-3 text-[17px] leading-7">{withFootnote(t.summary, t.citations)}</p>
                <ContactSheet ids={t.citations} media={media} numbers={numbers} sources={byId} />
              </Frame>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Threads worth reading">
        {document.notableThreads.length === 0 ? (
          <Empty />
        ) : (
          <ul>
            {document.notableThreads.map((t, i) => (
              <Frame key={i} marker="→">
                <h3 className="text-lg font-semibold text-balance">{t.title}</h3>
                <p className="mt-1.5 leading-7">{withFootnote(t.why, t.citations)}</p>
              </Frame>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What might happen next">
        {document.predictions.length === 0 ? (
          <Empty />
        ) : (
          <ol>
            {document.predictions.map((p, i) => (
              <Frame key={i} marker={frame(i)}>
                <h3 className="text-lg font-semibold text-balance">{p.claim}</h3>
                <div className="mt-1.5">
                  <ConfidenceScale level={p.confidence} />
                </div>
                <p className="mt-3 leading-7">{withFootnote(p.rationale, p.citations)}</p>
              </Frame>
            ))}
          </ol>
        )}
      </Section>
    </article>
  );
};
