import type { Confidence, ReportDocument, ReportSource } from '@cv/contracts';
import type { ReactNode } from 'react';
import { Citations } from './Citations';

const LEVELS: Confidence[] = ['low', 'medium', 'high'];

/** Three stops, like an exposure scale: how far the evidence carries the claim. */
const ConfidenceScale = ({ level }: { level: Confidence }) => (
  <span className="inline-flex items-center gap-2 font-sans text-xs text-mid">
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
  <section className="mt-10">
    <h2 className="font-sans text-sm font-semibold text-mid">{title}</h2>
    <div className="mt-3">{children}</div>
  </section>
);

const Empty = () => <p className="text-mid italic">Nothing the posts could support.</p>;

interface Props {
  document: ReportDocument;
  sources: ReportSource[];
  week: string;
}

export const ReportDocumentView = ({ document, sources, week }: Props) => {
  const byId = new Map(sources.map((s) => [s.postId, s]));
  const cite = (ids: number[]) => <Citations ids={ids} sources={byId} week={week} />;

  return (
    <article className="font-serif">
      <p className="text-xl leading-relaxed text-pretty">{document.mood.summary}</p>
      <div className="mt-3">{cite(document.mood.citations)}</div>

      <Section title="What people talked about">
        {document.themes.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-6">
            {document.themes.map((t, i) => (
              <li key={i}>
                <h3 className="text-lg font-semibold text-balance">{t.title}</h3>
                <p className="mt-1 font-sans text-xs text-mid">about {t.approxPostCount} posts</p>
                <p className="mt-2 leading-7">{t.summary}</p>
                <div className="mt-2">{cite(t.citations)}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Threads worth reading">
        {document.notableThreads.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-5">
            {document.notableThreads.map((t, i) => (
              <li key={i} className="border-l-2 border-rule pl-4">
                <h3 className="font-semibold">{t.title}</h3>
                <p className="mt-1 leading-7">{t.why}</p>
                <div className="mt-2">{cite(t.citations)}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What might happen next">
        {document.predictions.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-6">
            {document.predictions.map((p, i) => (
              <li key={i}>
                <h3 className="text-lg font-semibold text-balance">{p.claim}</h3>
                <div className="mt-1">
                  <ConfidenceScale level={p.confidence} />
                </div>
                <p className="mt-2 leading-7">{p.rationale}</p>
                <div className="mt-2">{cite(p.citations)}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </article>
  );
};
