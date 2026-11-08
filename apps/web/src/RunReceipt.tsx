import type { ReportRunResponse } from '@cv/contracts';
import { CallTable } from './CallTable';

/** What the run did and cost, so every number in the report can be traced to a call. */
export const RunReceipt = ({ run }: { run: ReportRunResponse }) => (
  <aside className="self-start rounded-md bg-panel p-5 text-sm lg:sticky lg:top-8">
    <h2 className="font-semibold">This run</h2>
    <p className="mt-1 text-mid">
      {new Date(run.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
    </p>

    {run.calls.length > 0 && <CallTable calls={run.calls} totalUsd={run.costUsd} />}

    {run.themes.length > 0 && (
      <>
        <h3 className="mt-6 font-semibold">Themes traced across four weeks</h3>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-mid">
          {run.themes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </>
    )}

    <h3 className="mt-6 font-semibold">Reading the citations</h3>
    <p className="mt-2 text-mid">
      <span className="rounded-sm bg-accent-soft px-1.5 text-xs text-accent">#123</span> a post from
      this week.{' '}
      <span className="rounded-sm border border-accent px-1.5 text-xs text-accent">#123</span> an
      earlier week, used as trend evidence.
    </p>
  </aside>
);
