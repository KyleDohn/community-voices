import type {
  AbRunResponse,
  CitationChecks,
  PairwiseResult,
  RubricScores,
  Variant,
  WeekSummary,
} from '@cv/contracts';
import { useEffect, useState } from 'react';
import { fetchAbRun, fetchWeeks, listAbRuns, messageOf, startAbRun } from './api';
import { CallTable } from './CallTable';
import { usd } from './format';
import { ReportDocumentView } from './ReportDocumentView';
import { WeekPicker } from './WeekPicker';

const POLL_MS = 3_000;

type Shown =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'run'; run: AbRunResponse }
  | { kind: 'error'; message: string };

// Left to right everywhere on the page: the control first, then the variant under test.
const VARIANTS: { key: Variant; name: string }[] = [
  { key: 'no_rag', name: 'Without retrieval' },
  { key: 'rag', name: 'With retrieval' },
];

const CRITERIA: { key: keyof RubricScores; name: string }[] = [
  { key: 'grounding', name: 'Grounded in the posts' },
  { key: 'specificity', name: 'Specific' },
  { key: 'coverage', name: 'Covers the week' },
  { key: 'predictionPlausibility', name: 'Plausible predictions' },
  { key: 'readability', name: 'Readable' },
];

const CHECKS: { name: string; count: (c: CitationChecks) => number }[] = [
  { name: 'Claims', count: (c) => c.claims },
  { name: 'Claims citing no post', count: (c) => c.uncitedClaims },
  { name: 'Citations', count: (c) => c.citations },
  { name: 'Cited posts that do not exist', count: (c) => c.notInCorpus.length },
  { name: 'Cited posts from the wrong week', count: (c) => c.outsideWeek.length },
  { name: 'Cited posts retrieval never found', count: (c) => c.notRetrieved.length },
];

/** A running run first (so a reload keeps polling it), then the latest success, then any. */
const latestRun = async (week: string) => {
  const runs = (await listAbRuns()).abRuns.filter((r) => r.weekStart === week);
  const pick =
    runs.find((r) => r.status === 'running') ??
    runs.find((r) => r.status === 'succeeded') ??
    runs[0];
  return pick && fetchAbRun(pick.id);
};

/** Five stops, like the exposure scale on the predictions: how well a report did on one criterion. */
const ScoreScale = ({ score }: { score: number }) => (
  <span className="inline-flex items-center gap-2">
    <span className="flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((stop) => (
        <span
          key={stop}
          className={`h-3 w-5 rounded-[1px] ${stop <= score ? 'bg-ink' : 'bg-rule'}`}
        />
      ))}
    </span>
    <span className="tabular-nums">{score} / 5</span>
  </span>
);

const verdictText = ({ winner, passes }: PairwiseResult) => {
  const name = (v: Variant) => VARIANTS.find((x) => x.key === v)!.name.toLowerCase();
  if (winner !== 'tie')
    return `The judge preferred the report written ${name(winner)}, in both orders.`;
  if (passes.every((p) => p.winner === 'tie')) return 'The judge called it a tie in both orders.';
  return 'The judge’s pick changed when the order was swapped, so this counts as a tie.';
};

const Verdict = ({ run }: { run: AbRunResponse }) => {
  if (!run.pairwise) return null;
  return (
    <p className="font-serif text-2xl leading-snug text-balance">{verdictText(run.pairwise)}</p>
  );
};

const Rubric = ({ rubric }: { rubric: NonNullable<AbRunResponse['rubric']> }) => (
  <section className="mt-8">
    <h2 className="text-sm font-semibold text-mid">Rubric scores, each report judged alone</h2>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="text-xs text-mid">
          <tr>
            <th className="pb-2 font-normal">Criterion</th>
            {VARIANTS.map((v) => (
              <th key={v.key} className="pb-2 font-normal">
                {v.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CRITERIA.map((c) => (
            <tr key={c.key} className="border-t border-rule align-top">
              <th scope="row" className="py-2 pr-4 font-medium">
                {c.name}
              </th>
              {VARIANTS.map((v) => {
                const { score, reason } = rubric[v.key][c.key];
                return (
                  <td key={v.key} className="py-2 pr-4">
                    <details>
                      <summary className="cursor-pointer list-none">
                        <ScoreScale score={score} />
                      </summary>
                      <p className="mt-1 max-w-[36ch] text-mid">{reason}</p>
                    </details>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="mt-2 text-xs text-mid">Select a score to read the judge’s reason.</p>
  </section>
);

const Checks = ({ checks }: { checks: NonNullable<AbRunResponse['checks']> }) => (
  <section className="mt-8">
    <h2 className="text-sm font-semibold text-mid">Citation checks, counted by code</h2>
    <table className="mt-3 w-full max-w-xl text-left text-sm tabular-nums">
      <thead className="text-xs text-mid">
        <tr>
          <th className="pb-2 font-normal">Check</th>
          {VARIANTS.map((v) => (
            <th key={v.key} className="pb-2 text-right font-normal">
              {v.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CHECKS.map((c) => (
          <tr key={c.name} className="border-t border-rule">
            <th scope="row" className="py-1.5 pr-4 font-normal">
              {c.name}
            </th>
            {VARIANTS.map((v) => (
              <td key={v.key} className="py-1.5 text-right">
                {c.count(checks[v.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

const Reasoning = ({ pairwise }: { pairwise: PairwiseResult }) => (
  <section className="mt-8 max-w-prose">
    <h2 className="text-sm font-semibold text-mid">The judge’s comparison, asked twice</h2>
    <ul className="mt-3 space-y-3 text-sm">
      {pairwise.passes.map((p) => {
        const first = VARIANTS.find((v) => v.key === p.x)!.name.toLowerCase();
        const pick =
          p.winner === 'tie'
            ? 'a tie'
            : VARIANTS.find((v) => v.key === p.winner)!.name.toLowerCase();
        return (
          <li key={p.x}>
            <p className="font-medium">
              Shown the report {first} first, it picked {pick}.
            </p>
            <p className="mt-1 text-mid">{p.reason}</p>
          </li>
        );
      })}
    </ul>
  </section>
);

const SampleNotice = ({ run }: { run: AbRunResponse }) => {
  const models = [...new Set(run.calls.map((c) => c.model))].join(', ');
  const recorded = new Date(run.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' });
  return (
    <p className="mb-6 rounded-md border border-accent bg-accent-soft px-4 py-3 text-sm text-ink">
      <span className="font-semibold">Sample run.</span> Recorded {recorded} with {models} and
      shipped with the app, so this page works without an API key. Run a new A/B to compare live.
    </p>
  );
};

const RunStatus = ({ run }: { run: AbRunResponse }) => {
  if (run.status === 'running') {
    return (
      <p className="text-mid" role="status">
        {run.ragReport
          ? 'The report with retrieval is written. Now writing without retrieval, then judging both.'
          : 'Writing the report with retrieval.'}{' '}
        A full run takes a few minutes.
      </p>
    );
  }
  if (run.status === 'failed' && run.error) {
    return (
      <div className="rounded-md border border-warn p-4 text-sm" role="alert">
        <p className="font-semibold text-warn">
          The A/B run stopped: {run.error.code.replaceAll('_', ' ')}
        </p>
        <p className="mt-1">{run.error.message}</p>
        <p className="mt-1 text-mid">Spent before stopping: {usd(run.costUsd)}</p>
      </div>
    );
  }
  return null;
};

const Documents = ({ run }: { run: AbRunResponse }) => {
  const documents = { rag: run.ragReport?.document, no_rag: run.noRagDocument };
  if (!documents.rag && !documents.no_rag) return null;
  return (
    <section className="mt-12 grid gap-12 border-t border-rule pt-8 lg:grid-cols-2">
      {VARIANTS.map((v) => {
        const document = documents[v.key];
        return (
          <div key={v.key} className="min-w-0">
            <h2 className="mb-4 text-sm font-semibold text-mid">{v.name}</h2>
            {document ? (
              <ReportDocumentView
                document={document}
                // Without retrieval the writer saw no posts, so none of its citations can link.
                sources={v.key === 'rag' ? (run.ragReport?.sources ?? []) : []}
                week={run.weekStart}
              />
            ) : (
              <p className="text-mid">Not written yet.</p>
            )}
          </div>
        );
      })}
    </section>
  );
};

export const AbView = () => {
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [week, setWeek] = useState<string>();
  const [shown, setShown] = useState<Shown>({ kind: 'loading' });
  const [notice, setNotice] = useState<string>();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchWeeks()
      .then(({ weeks }) => {
        setWeeks(weeks);
        const ready = weeks.find((w) => w.embedded > 0)?.weekStart;
        setWeek(ready);
        if (!ready) setShown({ kind: 'none' });
      })
      .catch((error: unknown) => setShown({ kind: 'error', message: messageOf(error) }));
  }, []);

  useEffect(() => {
    if (!week) return;
    let current = true;
    latestRun(week)
      .then((run) => current && setShown(run ? { kind: 'run', run } : { kind: 'none' }))
      .catch((error: unknown) => current && setShown({ kind: 'error', message: messageOf(error) }));
    return () => void (current = false);
  }, [week]);

  const running = shown.kind === 'run' && shown.run.status === 'running' ? shown.run : undefined;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      fetchAbRun(running.id)
        .then((run) =>
          setShown((s) => (s.kind === 'run' && s.run.id === run.id ? { kind: 'run', run } : s)),
        )
        .catch((error: unknown) =>
          setShown((s) =>
            s.kind === 'run' && s.run.id === running.id
              ? { kind: 'error', message: messageOf(error) }
              : s,
          ),
        );
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [running]);

  const selectWeek = (next: string) => {
    setShown({ kind: 'loading' });
    setNotice(undefined);
    setWeek(next);
  };

  const start = async () => {
    if (!week) return;
    setStarting(true);
    setNotice(undefined);
    try {
      const { id } = await startAbRun(week);
      setShown({ kind: 'run', run: await fetchAbRun(id) });
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setStarting(false);
    }
  };

  const run = shown.kind === 'run' ? shown.run : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        {weeks.length > 0 && week && (
          <WeekPicker
            weeks={weeks}
            week={week}
            onChange={selectWeek}
            disabled={starting || running !== undefined}
          />
        )}
        <button
          type="button"
          onClick={start}
          disabled={!week || starting || running !== undefined}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40"
        >
          Run new A/B
        </button>
      </div>
      <p className="mt-2 max-w-prose text-xs text-mid">
        Writes the week’s report twice, with and without the forum’s posts, then has a judge model
        score both without telling it which is which. A run costs about $0.40.
      </p>
      {notice && (
        <p className="mt-3 text-sm text-warn" role="alert">
          {notice}
        </p>
      )}

      <div className="mt-10">
        {shown.kind === 'loading' && <p className="text-mid">Loading…</p>}
        {shown.kind === 'error' && <p className="text-warn">{shown.message}</p>}
        {shown.kind === 'none' && (
          <p className="max-w-prose font-serif text-lg text-mid">
            No A/B run for this week yet. Run one to see how much the forum’s own posts change the
            report.
          </p>
        )}
        {run && (
          <>
            {run.isSample && <SampleNotice run={run} />}
            <RunStatus run={run} />
            <Verdict run={run} />
            {run.rubric && <Rubric rubric={run.rubric} />}
            {run.checks && <Checks checks={run.checks} />}
            {run.pairwise && <Reasoning pairwise={run.pairwise} />}
            <Documents run={run} />
            {run.calls.length > 0 && run.status !== 'running' && (
              <section className="mt-12 max-w-xl border-t border-rule pt-8 text-sm">
                <h2 className="text-sm font-semibold text-mid">Calls and cost</h2>
                <CallTable calls={run.calls} totalUsd={run.costUsd} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};
