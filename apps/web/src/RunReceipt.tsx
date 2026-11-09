import type { ReportRunResponse } from '@cv/contracts';
import { CallTable } from './CallTable';
import { tokens, usd } from './format';

/** Context beside the report: the four-week themes and how to read the footnotes. */
export const RunSidebar = ({ run }: { run: ReportRunResponse }) => (
  <aside className="flex flex-col gap-10 self-start text-sm">
    {run.themes.length > 0 && (
      <section>
        <h2 className="exif font-medium">Themes traced across four weeks</h2>
        <ol className="mt-3">
          {run.themes.map((t, i) => (
            <li
              key={t}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 border-t border-rule py-3 leading-normal"
            >
              <span className="pt-0.5 font-mono text-[11px] text-mid">
                {String(i + 1).padStart(2, '0')}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </section>
    )}
    <section className="leading-normal text-mid">
      <h2 className="exif font-medium">Reading the footnotes</h2>
      <p className="mt-3">
        Select a number like <span className="font-mono text-xs text-accent">1–3</span> to see the
        posts behind a paragraph. Posts from earlier weeks show their dates, since they back a trend
        rather than this week.
      </p>
    </section>
  </aside>
);

/** What the run did and cost, folded away so it never outranks the report. */
export const RunInfo = ({ run }: { run: ReportRunResponse }) => {
  if (run.calls.length === 0) return null;
  const tokensIn = run.calls.reduce(
    (sum, c) => sum + c.inputTokens + c.cacheWriteTokens + c.cacheReadTokens,
    0,
  );
  const tokensOut = run.calls.reduce((sum, c) => sum + c.outputTokens, 0);
  const created = new Date(run.createdAt).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <details className="group mt-14 rounded-lg border border-rule bg-panel text-sm">
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="exif text-ink">Run info</span>
        <span className="exif">{created}</span>
        <span className="exif">{run.calls.length} calls</span>
        <span className="exif">{tokens(tokensIn)} tok in</span>
        <span className="exif">{tokens(tokensOut)} tok out</span>
        <span className="exif text-ink">{usd(run.costUsd)}</span>
        <span className="exif ml-auto group-open:hidden">Details ▾</span>
        <span className="exif ml-auto hidden group-open:inline">Hide ▴</span>
      </summary>
      <div className="border-t border-rule px-4 pb-4">
        <CallTable calls={run.calls} totalUsd={run.costUsd} />
      </div>
    </details>
  );
};
