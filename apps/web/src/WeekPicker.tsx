import type { WeekSummary } from '@cv/contracts';
import { weekRange } from './format';

export const WeekPicker = ({
  weeks,
  week,
  onChange,
  disabled,
}: {
  weeks: WeekSummary[];
  week: string;
  onChange: (week: string) => void;
  disabled: boolean;
}) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-mid">Week</span>
    <select
      value={week}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
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
