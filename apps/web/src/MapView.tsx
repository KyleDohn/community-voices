import type { MapPoint, MapResponse, ReportSummary } from '@cv/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchMap, fetchWeeks, listReports, messageOf } from './api';
import { weekRange } from './format';

const POLL_MS = 2_000;
const WEEK_STEPS = 4;
const DOT_RADIUS = 2.5;
// Bigger than a dot, so a 2.5px point is still easy to hit with a mouse or a finger.
const HIT_RADIUS = 12;
const PADDING = 14;

type Loaded =
  { kind: 'loading' } | { kind: 'ok'; map: MapResponse } | { kind: 'error'; message: string };

/** Outline radius grows with the square root of runs, so area tracks the count. */
const outlineRadius = (runs: number) => 4 + 2 * Math.sqrt(Math.max(runs, 1));

/** Newest week takes the strongest step; anything older than the ramp shares the lightest. */
const weekSteps = (points: MapPoint[]) => {
  const weeks = [...new Set(points.map((p) => p.weekStart))].sort();
  return new Map(weeks.map((w, i) => [w, Math.max(0, WEEK_STEPS - weeks.length + i)]));
};

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();

/** Fits the projection into the box with one scale for both axes: UMAP's x and y are alike. */
const fitter = (points: MapPoint[], width: number, height: number) => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = Math.min(
    (width - 2 * PADDING) / (maxX - minX || 1),
    (height - 2 * PADDING) / (maxY - minY || 1),
  );
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;
  return (p: MapPoint) => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (maxY - p.y) * scale,
  });
};

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

/** Bumps when the OS switches light/dark, so the canvas repaints with the new tokens. */
const useColorScheme = () => {
  const [scheme, setScheme] = useState(0);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setScheme((n) => n + 1);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return scheme;
};

const Scatter = ({ points, highlight }: { points: MapPoint[]; highlight: Set<number> }) => {
  const [wrapRef, width] = useWidth();
  const height = Math.round(Math.min(640, Math.max(320, width * 0.7)));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scheme = useColorScheme();
  const [hovered, setHovered] = useState<number>();
  const [pinned, setPinned] = useState<number>();
  const steps = useMemo(() => weekSteps(points), [points]);
  const placed = useMemo(() => {
    const place = fitter(points, width, height);
    return points.map(place);
  }, [points, width, height]);
  const active = pinned ?? hovered;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const colors = Array.from({ length: WEEK_STEPS }, (_, i) =>
      cssVar(canvas, `--color-week-${i}`),
    );
    const [ink, panel] = [cssVar(canvas, '--color-ink'), cssVar(canvas, '--color-panel')];
    const dim = highlight.size > 0;
    const dot = (i: number, radius: number) => {
      const { x, y } = placed[i]!;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
    };

    points.forEach((p, i) => {
      if (highlight.has(p.postId)) return;
      ctx.globalAlpha = dim ? 0.3 : 0.85;
      ctx.fillStyle = colors[steps.get(p.weekStart) ?? 0]!;
      dot(i, DOT_RADIUS);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    // Highlighted posts on top, each with a surface ring so overlapping outlines stay separate.
    points.forEach((p, i) => {
      if (!highlight.has(p.postId)) return;
      ctx.fillStyle = colors[steps.get(p.weekStart) ?? 0]!;
      dot(i, DOT_RADIUS + 1);
      ctx.fill();
      dot(i, outlineRadius(p.runs));
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = panel;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ink;
      ctx.stroke();
    });
    if (active !== undefined) {
      // Accent, not ink, so the pointer's ring never reads as "in the report".
      dot(active, 8);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = cssVar(canvas, '--color-accent');
      ctx.stroke();
    }
  }, [points, placed, highlight, steps, width, height, active, scheme]);

  const nearest = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const [mx, my] = [event.clientX - rect.left, event.clientY - rect.top];
    let best: number | undefined;
    let bestDistance = HIT_RADIUS;
    placed.forEach(({ x, y }, i) => {
      const d = Math.hypot(x - mx, y - my);
      if (d < bestDistance) [best, bestDistance] = [i, d];
    });
    return best;
  };

  const shown = active === undefined ? undefined : points[active];
  const at = active === undefined ? undefined : placed[active];

  return (
    <div ref={wrapRef} className="relative">
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        className="block cursor-crosshair touch-manipulation"
        role="img"
        aria-label={`Map of ${points.length} post chunks, colored by week. The list below names the highlighted posts.`}
        onPointerMove={(e) => setHovered(nearest(e))}
        onPointerLeave={() => setHovered(undefined)}
        onClick={(e) => setPinned(nearest(e))}
      />
      {shown && at && (
        <div
          className="absolute z-10 w-64 max-w-[80%] rounded-md border border-rule bg-panel p-3 text-sm shadow-md"
          style={{
            left: Math.min(Math.max(at.x - 128, 0), Math.max(width - 256, 0)),
            top: at.y + 14 + 120 > height ? Math.max(at.y - 134, 0) : at.y + 14,
          }}
          role="status"
        >
          <p className="font-medium text-ink">{shown.topicTitle}</p>
          <p className="mt-1 text-mid">
            Post #{shown.postNumber} · week of {weekRange(shown.weekStart)}
          </p>
          <p className="text-mid">
            {shown.runs === 0
              ? 'Never retrieved'
              : `Retrieved in ${shown.runs} run${shown.runs === 1 ? '' : 's'}`}
          </p>
          {pinned !== undefined ? (
            <a
              href={shown.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-accent hover:underline"
            >
              Open the post on the forum ↗
            </a>
          ) : (
            <p className="mt-2 text-xs text-mid">Click to pin and get a link.</p>
          )}
        </div>
      )}
    </div>
  );
};

const Legend = ({ points, highlighting }: { points: MapPoint[]; highlighting: boolean }) => {
  const steps = weekSteps(points);
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-mid">
      {[...steps].map(([week, step]) => (
        <li key={week} className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-full"
            style={{ background: `var(--color-week-${step})` }}
          />
          {weekRange(week)}
        </li>
      ))}
      {highlighting && (
        <li className="flex items-center gap-2">
          <span className="inline-block size-4 rounded-full border-[1.5px] border-ink" />
          In the report; a bigger ring means retrieved in more runs
        </li>
      )}
    </ul>
  );
};

/** The same highlighted posts as text, for screen readers and anyone who can't use the canvas. */
const HighlightList = ({ points, highlight }: { points: MapPoint[]; highlight: Set<number> }) => {
  const posts = [
    ...new Map(points.filter((p) => highlight.has(p.postId)).map((p) => [p.postId, p])),
  ]
    .map(([, p]) => p)
    .sort((a, b) => b.runs - a.runs || a.topicTitle.localeCompare(b.topicTitle));
  return (
    <details className="mt-6 text-sm">
      <summary className="cursor-pointer text-mid hover:text-ink">
        List the {posts.length} highlighted posts
      </summary>
      <ol className="mt-3 divide-y divide-rule border-y border-rule">
        {posts.map((p) => (
          <li key={p.postId} className="flex items-baseline justify-between gap-4 py-2">
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 text-accent hover:underline"
            >
              {p.topicTitle} <span className="text-mid">#{p.postNumber}</span>
            </a>
            <span className="shrink-0 text-mid tabular-nums">{p.runs} runs</span>
          </li>
        ))}
      </ol>
    </details>
  );
};

const reportLabel = (r: ReportSummary) =>
  `Report of ${new Date(r.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;

export const MapView = () => {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [reportId, setReportId] = useState<string>();
  const [state, setState] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    // Reports of the newest week, so the map opens with the latest report highlighted.
    fetchWeeks()
      .then(({ weeks }) => (weeks[0] ? listReports(weeks[0].weekStart) : { reports: [] }))
      .then(({ reports }) => {
        const done = reports.filter((r) => r.status === 'succeeded');
        setReports(done);
        setReportId(done[0]?.id ?? '');
      })
      .catch(() => setReportId(''));
  }, []);

  useEffect(() => {
    if (reportId === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    const load = () =>
      fetchMap(reportId || undefined).then(
        (map) => {
          if (!live) return;
          setState({ kind: 'ok', map });
          if (map.status === 'computing') timer = setTimeout(load, POLL_MS);
        },
        (error: unknown) => live && setState({ kind: 'error', message: messageOf(error) }),
      );
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [reportId]);

  const highlight = useMemo(
    () => new Set(state.kind === 'ok' ? state.map.highlightPostIds : []),
    [state],
  );

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl font-semibold">Embeddings map</h2>
        {reports.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-mid">
            Highlight
            <select
              className="rounded-md border border-rule bg-panel px-2 py-1 text-ink"
              value={reportId ?? ''}
              onChange={(e) => {
                setState({ kind: 'loading' });
                setReportId(e.target.value);
              }}
            >
              <option value="">Nothing</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {reportLabel(r)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="mt-2 max-w-prose text-sm text-mid">
        Each dot is a piece of a forum post, placed by UMAP so that posts about similar things sit
        close together. Only closeness means anything: the distance between far-apart groups and the
        axes themselves carry no meaning.
      </p>
      <div className="mt-5 rounded-lg border border-rule bg-panel p-3 sm:p-4">
        {state.kind === 'loading' ? (
          <p className="p-4 text-sm text-mid">Loading…</p>
        ) : state.kind === 'error' ? (
          <p className="p-4 text-sm text-warn" role="alert">
            {state.message}
          </p>
        ) : state.map.status === 'computing' ? (
          <p className="p-4 text-sm text-mid" role="status">
            Laying out the map from the embedded posts. This takes a few seconds once the posts are
            indexed (a few minutes on first boot).
          </p>
        ) : state.map.status === 'failed' ? (
          <p className="p-4 text-sm text-warn" role="alert">
            The map could not be computed. The server log has the details.
          </p>
        ) : state.map.points.length === 0 ? (
          <p className="p-4 text-sm text-mid">No embedded posts yet, so there is nothing to map.</p>
        ) : (
          <>
            <Legend points={state.map.points} highlighting={highlight.size > 0} />
            <div className="mt-3">
              <Scatter points={state.map.points} highlight={highlight} />
            </div>
          </>
        )}
      </div>
      {state.kind === 'ok' && highlight.size > 0 && (
        <HighlightList points={state.map.points} highlight={highlight} />
      )}
    </section>
  );
};
