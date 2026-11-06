import { describe, expect, it } from 'vitest';
import { priorWeeks, targetWeek, weekOf } from './week';

const utc = (iso: string) => new Date(iso);
const week = (start: string, end: string) => ({ start: utc(start), end: utc(end) });

describe('targetWeek', () => {
  it('on Sunday 23:59 the current week is not complete, so it returns the week before', () => {
    expect(targetWeek(utc('2026-11-08T23:59:59.999Z'))).toEqual(
      week('2026-10-26T00:00:00Z', '2026-11-02T00:00:00Z'),
    );
  });

  it('at Monday 00:00 the week just ended becomes the target', () => {
    expect(targetWeek(utc('2026-11-09T00:00:00Z'))).toEqual(
      week('2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z'),
    );
  });

  it('handles a week that spans the new year', () => {
    expect(targetWeek(utc('2026-01-05T09:30:00Z'))).toEqual(
      week('2025-12-29T00:00:00Z', '2026-01-05T00:00:00Z'),
    );
  });
});

describe('priorWeeks', () => {
  it('returns the n weeks before the target, oldest first', () => {
    const target = week('2025-12-29T00:00:00Z', '2026-01-05T00:00:00Z');
    expect(priorWeeks(target, 3)).toEqual([
      week('2025-12-08T00:00:00Z', '2025-12-15T00:00:00Z'),
      week('2025-12-15T00:00:00Z', '2025-12-22T00:00:00Z'),
      week('2025-12-22T00:00:00Z', '2025-12-29T00:00:00Z'),
    ]);
  });
});

describe('weekOf', () => {
  it('maps a timestamp to the Monday 00:00 UTC that starts its week', () => {
    expect(weekOf(utc('2026-11-08T23:59:59.999Z'))).toEqual(utc('2026-11-02T00:00:00Z'));
    expect(weekOf(utc('2026-11-09T00:00:00Z'))).toEqual(utc('2026-11-09T00:00:00Z'));
  });
});
