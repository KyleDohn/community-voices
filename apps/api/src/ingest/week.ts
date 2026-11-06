/** A Monday-to-Monday UTC window; `end` is exclusive so adjacent weeks never overlap. */
export interface Week {
  start: Date;
  end: Date;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const mondayOnOrBefore = (now: Date): Date => {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(midnight - daysSinceMonday * DAY_MS);
};

const weekStartingAt = (startMs: number): Week => ({
  start: new Date(startMs),
  end: new Date(startMs + WEEK_MS),
});

/** The latest complete week: the one that ended at the most recent Monday 00:00 UTC. */
export const targetWeek = (now: Date): Week =>
  weekStartingAt(mondayOnOrBefore(now).getTime() - WEEK_MS);

/** The `count` weeks before `target`, oldest first. */
export const priorWeeks = (target: Week, count: number): Week[] =>
  Array.from({ length: count }, (_, i) =>
    weekStartingAt(target.start.getTime() - (count - i) * WEEK_MS),
  );
