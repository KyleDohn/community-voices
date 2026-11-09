import { z } from 'zod';
import { ingestionWindow, targetWeek, weekOf } from '../ingest/week';

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * `--week`: a Monday, defaulting to the latest complete week. Chunks are keyed by the Monday that
 * starts their week, so any other day would match nothing.
 */
export const WeekArg = z.iso
  .date()
  // zod still runs refinements after the date check fails, so guard against an invalid date.
  .refine((day) => {
    const date = new Date(day);
    return !Number.isNaN(date.getTime()) && isoDay(weekOf(date)) === day;
  }, 'must be a Monday')
  .default(isoDay(targetWeek(new Date()).start));

/** The corpus window whose latest complete week starts on `week`, a Monday. */
export const windowEndingWith = (week: string, historyWeeks: number) =>
  // The instant the week ends, so it is the latest complete one.
  ingestionWindow(new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000), historyWeeks);
