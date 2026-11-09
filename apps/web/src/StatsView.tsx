import type { CostStatsResponse, RetrievalStatsResponse, RunCost } from '@cv/contracts';
import { useEffect, useState } from 'react';
import { fetchCostStats, fetchRetrievalStats, messageOf } from './api';
import { usd, weekRange } from './format';

type Loaded<T> = { kind: 'loading' } | { kind: 'ok'; data: T } | { kind: 'error'; message: string };

const useLoad = <T,>(load: () => Promise<T>) => {
  const [state, setState] = useState<Loaded<T>>({ kind: 'loading' });
  useEffect(() => {
    load().then(
      (data) => setState({ kind: 'ok', data }),
      (error: unknown) => setState({ kind: 'error', message: messageOf(error) }),
    );
  }, [load]);
  return state;
};

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

const Status = <T,>({
  state,
  children,
}: {
  state: Loaded<T>;
  children: (data: T) => React.ReactNode;
}) =>
  state.kind === 'loading' ? (
    <p className="mt-4 text-sm text-mid">Loading…</p>
  ) : state.kind === 'error' ? (
    <p className="mt-4 text-sm text-warn" role="alert">
      {state.message}
    </p>
  ) : (
    children(state.data)
  );

const MostRetrieved = ({ data: { totalRuns, posts } }: { data: RetrievalStatsResponse }) =>
  posts.length === 0 ? (
    <p className="mt-4 max-w-prose text-sm text-mid">
      No retrievals are logged yet. Generate a report or run an A/B comparison, and the posts it
      retrieved show up here. The committed sample run doesn’t include its retrievals.
    </p>
  ) : (
    <ol className="mt-4 divide-y divide-rule border-y border-rule text-sm">
      {posts.map((p) => (
        <li key={p.postId} className="flex items-baseline justify-between gap-4 py-3">
          <div className="min-w-0">
            {p.url ? (
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                {p.topicTitle ?? `Post ${p.postId}`}
              </a>
            ) : (
              <span>Post {p.postId} (no longer in the database)</span>
            )}
            <div className="exif mt-1">
              {p.postNumber !== null && <>Post {p.postNumber} in the thread</>}
              {p.weekStart && <>, written {weekRange(p.weekStart)}</>}
            </div>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            {p.runs} of {totalRuns} runs
            <div className="exif mt-1">
              {p.facetHits} by topic, {p.trendHits} by trend
            </div>
          </div>
        </li>
      ))}
    </ol>
  );

const KIND: Record<RunCost['kind'], string> = { ab: 'A/B run', report: 'Report' };

const Costs = ({ data: { runs, totalUsd } }: { data: CostStatsResponse }) =>
  runs.length === 0 ? (
    <p className="mt-4 text-sm text-mid">No runs yet.</p>
  ) : (
    <table className="mt-4 w-full text-left text-sm tabular-nums">
      <caption className="sr-only">Cost of each run</caption>
      <thead className="exif">
        <tr>
          <th className="pb-1 font-normal">Run</th>
          <th className="pb-1 font-normal">Week</th>
          <th className="pb-1 text-right font-normal">Cost</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id} className="border-t border-rule align-top">
            <td className="py-1.5">
              {KIND[r.kind]}
              {r.isSample && <span className="text-mid"> (sample)</span>}
              {r.status !== 'succeeded' && <span className="text-warn"> ({r.status})</span>}
              <div className="text-xs whitespace-nowrap text-mid">
                {when.format(new Date(r.createdAt))} UTC
              </div>
            </td>
            <td className="py-1.5 pr-3">{weekRange(r.weekStart)}</td>
            <td className="py-1.5 text-right">{usd(r.costUsd)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-ink font-semibold">
          <td className="pt-1.5" colSpan={2}>
            Total
          </td>
          <td className="pt-1.5 text-right">{usd(totalUsd)}</td>
        </tr>
      </tfoot>
    </table>
  );

export const StatsView = () => {
  const retrieved = useLoad(fetchRetrievalStats);
  const costs = useLoad(fetchCostStats);
  return (
    <div className="grid gap-12 lg:grid-cols-[3fr_2fr]">
      <section className="min-w-0">
        <h2 className="exif font-medium">Most retrieved posts</h2>
        <p className="mt-1 max-w-prose text-sm text-mid">
          Ranked by how many retrieval runs found each post. A run counts once per post, however
          many queries matched it.
        </p>
        <Status state={retrieved}>{(data) => <MostRetrieved data={data} />}</Status>
      </section>
      <section className="min-w-0">
        <h2 className="exif font-medium">What each run cost</h2>
        <p className="mt-1 max-w-prose text-sm text-mid">
          A report made inside an A/B run is part of that run’s cost, so it isn’t listed twice.
        </p>
        <Status state={costs}>{(data) => <Costs data={data} />}</Status>
      </section>
    </div>
  );
};
