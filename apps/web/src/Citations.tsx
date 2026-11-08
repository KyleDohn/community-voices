import type { ReportSource } from '@cv/contracts';

interface CitationsProps {
  ids: number[];
  sources: Map<number, ReportSource>;
  week: string;
}

/**
 * Citations read like frame numbers on a contact sheet. Filled: a post from this week.
 * Outlined: an earlier week's trend example. Struck through: an id the writer was never given.
 */
export const Citations = ({ ids, sources, week }: CitationsProps) => {
  if (ids.length === 0) return <span className="text-sm text-mid italic">No posts cited</span>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Cited posts">
      {ids.map((id) => {
        const source = sources.get(id);
        const base = 'inline-block rounded-sm px-1.5 py-px font-sans text-xs tabular-nums';
        if (!source) {
          return (
            <li
              key={id}
              className={`${base} text-mid line-through`}
              title="Not among the posts the writer saw"
            >
              #{id}
            </li>
          );
        }
        const prior = source.weekStart !== week;
        const style = prior
          ? 'border border-accent text-accent'
          : 'border border-transparent bg-accent-soft text-accent';
        return (
          <li key={id}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className={`${base} ${style} hover:underline`}
              title={
                prior ? `${source.topicTitle} (week of ${source.weekStart})` : source.topicTitle
              }
            >
              #{id}
            </a>
          </li>
        );
      })}
    </ul>
  );
};
