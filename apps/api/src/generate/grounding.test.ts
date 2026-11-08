import type { ReportDocument } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { validateGrounding } from './grounding';

// 1-3 are target-week posts in the context; 50 is a prior-week trend example.
const allowed = { targetWeek: new Set([1, 2, 3]), priorWeeks: new Set([50]) };

const doc = (overrides: Partial<ReportDocument> = {}): ReportDocument => ({
  themes: [{ title: 't', summary: 's', approxPostCount: 2, citations: [1, 2] }],
  notableThreads: [{ title: 'n', why: 'w', citations: [3] }],
  mood: { summary: 'm', citations: [] },
  predictions: [{ claim: 'c', rationale: 'r', confidence: 'low', citations: [1, 50] }],
  ...overrides,
});

describe('validateGrounding', () => {
  it('accepts target-week citations everywhere and prior-week examples in predictions', () => {
    expect(validateGrounding(doc(), allowed)).toEqual([]);
  });

  it('names each citation that was not in the context, with its path', () => {
    const errors = validateGrounding(
      doc({
        themes: [{ title: 't', summary: 's', approxPostCount: 1, citations: [1, 999] }],
        predictions: [{ claim: 'c', rationale: 'r', confidence: 'low', citations: [777] }],
      }),
      allowed,
    );
    expect(errors).toEqual([
      expect.stringMatching(/^themes\[0\]\.citations: post 999 .*not in the supplied posts/),
      expect.stringMatching(/^predictions\[0\]\.citations: post 777 /),
    ]);
  });

  it('rejects prior-week examples outside predictions', () => {
    const errors = validateGrounding(
      doc({
        notableThreads: [{ title: 'n', why: 'w', citations: [50] }],
        mood: { summary: 'm', citations: [50] },
      }),
      allowed,
    );
    expect(errors).toEqual([
      expect.stringMatching(/^notableThreads\[0\]\.citations: post 50 .*only predictions/),
      expect.stringMatching(/^mood\.citations: post 50 .*only predictions/),
    ]);
  });
});
