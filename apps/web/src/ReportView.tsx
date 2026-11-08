import type { ReportRunResponse, WeekSummary } from '@cv/contracts';
import { useEffect, useState } from 'react';
import { ApiError, fetchReport, fetchWeeks, listReports, startReport } from './api';
import { usd, weekRange } from './format';
import { ReportDocumentView } from './ReportDocumentView';
import { RunReceipt } from './RunReceipt';

const POLL_MS = 2_000;

type Shown =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'run'; run: ReportRunResponse }
  | { kind: 'error'; message: string };

const messageOf = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : 'The API could not be reached. Is the server running?';

/** The latest succeeded run for the week, or else the latest of any status. */
const latestRun = async (week: string) => {
  const { reports } = await listReports(week);
  const pick = reports.find((r) => r.status === 'succeeded') ?? reports[0];
  return pick && fetchReport(pick.id);
};

const WeekPicker = ({
  weeks,
  week,
  onChange,
}: {
  weeks: WeekSummary[];
  week: string;
  onChange: (week: string) => void;
}) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-mid">Week</span>
    <select
      value={week}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-rule bg-panel px-3 py-2 text-ink"
    >
      {weeks.map((w) => (
        <option key={w.weekStart} value={w.weekStart}>
          {weekRange(w.weekStart)} ({w.posts} posts)
        </option>
      ))}
    </select>
  </label>
);

const RunStatus = ({ run }: { run: ReportRunResponse }) => {
  if (run.status === 'running') {
    return (
      <p className="font-sans text-mid" role="status">
        Reading the week's posts and writing the report. This takes about a minute.
      </p>
    );
  }
  if (run.status === 'failed' && run.error) {
    return (
      <div className="rounded-md border border-warn p-4 font-sans text-sm" role="alert">
        <p className="font-semibold text-warn">
          The report stopped: {run.error.code.replaceAll('_', ' ')}
        </p>
        <p className="mt-1">{run.error.message}</p>
        <p className="mt-1 text-mid">Spent before stopping: {usd(run.costUsd)}</p>
      </div>
    );
  }
  return null;
};

export const ReportView = () => {
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [week, setWeek] = useState<string>();
  const [shown, setShown] = useState<Shown>({ kind: 'loading' });
  const [notice, setNotice] = useState<string>();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchWeeks()
      .then(({ weeks }) => {
        setWeeks(weeks);
        setWeek(weeks.find((w) => w.embedded > 0)?.weekStart);
        if (weeks.length === 0) setShown({ kind: 'none' });
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
      fetchReport(running.id)
        .then((run) =>
          setShown((s) => (s.kind === 'run' && s.run.id === run.id ? { kind: 'run', run } : s)),
        )
        .catch((error: unknown) => setShown({ kind: 'error', message: messageOf(error) }));
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [running]);

  const selectWeek = (next: string) => {
    setShown({ kind: 'loading' });
    setNotice(undefined);
    setWeek(next);
  };

  const generate = async () => {
    if (!week) return;
    setStarting(true);
    setNotice(undefined);
    try {
      const { id } = await startReport(week);
      setShown({ kind: 'run', run: await fetchReport(id) });
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setStarting(false);
    }
  };

  const shownRun = shown.kind === 'run' ? shown.run : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        {weeks.length > 0 && week && <WeekPicker weeks={weeks} week={week} onChange={selectWeek} />}
        <button
          type="button"
          onClick={generate}
          disabled={!week || starting || running !== undefined}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40"
        >
          {shownRun?.status === 'succeeded' ? 'Generate a new report' : 'Generate report'}
        </button>
      </div>
      {notice && (
        <p className="mt-3 text-sm text-warn" role="alert">
          {notice}
        </p>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,68ch)_20rem] lg:justify-between">
        <div>
          {shown.kind === 'loading' && <p className="text-mid">Loading…</p>}
          {shown.kind === 'error' && <p className="text-warn">{shown.message}</p>}
          {shown.kind === 'none' && (
            <p className="max-w-prose font-serif text-lg text-mid">
              No report for this week yet. Generate one to see the week's themes, the threads worth
              reading and what might come next, each backed by links to the posts.
            </p>
          )}
          {shownRun && <RunStatus run={shownRun} />}
          {shownRun?.document && week && (
            <ReportDocumentView
              document={shownRun.document}
              sources={shownRun.sources}
              week={shownRun.weekStart}
            />
          )}
        </div>
        {shownRun && shownRun.status !== 'running' && <RunReceipt run={shownRun} />}
      </div>
    </div>
  );
};
