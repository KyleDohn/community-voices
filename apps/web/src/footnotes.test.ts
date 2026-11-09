import { describe, expect, it } from 'vitest';
import { footnoteLabel, numberSources } from './footnotes';

describe('numberSources', () => {
  it('numbers posts in order of first citation, reusing the number on repeat', () => {
    const numbers = numberSources([[30, 10], [], [10, 20]]);
    expect([...numbers]).toEqual([
      [30, 1],
      [10, 2],
      [20, 3],
    ]);
  });
});

describe('footnoteLabel', () => {
  it('lists one or two numbers with commas', () => {
    expect(footnoteLabel([4])).toBe('4');
    expect(footnoteLabel([5, 4])).toBe('4,5');
  });

  it('collapses a run of three or more into a range', () => {
    expect(footnoteLabel([24, 25, 26, 27])).toBe('24–27');
    expect(footnoteLabel([2, 6, 7, 8])).toBe('2,6–8');
  });

  it('sorts and drops repeats', () => {
    expect(footnoteLabel([3, 1, 2, 2])).toBe('1–3');
  });
});
