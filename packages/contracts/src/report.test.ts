import { describe, expect, it } from 'vitest';
import { ReportDocument } from './report';

const valid = {
  themes: [
    {
      title: 'darktable 5.4 colour regressions',
      summary: 'Several users report shifted colours after upgrading.',
      approxPostCount: 12,
      citations: [101, 102],
    },
  ],
  notableThreads: [
    { title: 'Play Raw: misty harbour', why: 'Twenty edits in two days.', citations: [201] },
  ],
  mood: { summary: 'Mostly upbeat, with frustration about the regression.', citations: [] },
  predictions: [
    {
      claim: 'A 5.4.1 bug-fix release lands within two weeks.',
      rationale: 'The regression thread grew each week.',
      confidence: 'medium',
      citations: [101, 9001],
    },
  ],
};

describe('ReportDocument', () => {
  it('parses a complete document, including empty citation lists', () => {
    expect(ReportDocument.parse(valid)).toEqual(valid);
  });

  it('rejects a citation that is not an integer post id', () => {
    const doc = { ...valid, themes: [{ ...valid.themes[0], citations: ['101'] }] };
    expect(ReportDocument.safeParse(doc).success).toBe(false);
    const fractional = { ...valid, mood: { ...valid.mood, citations: [1.5] } };
    expect(ReportDocument.safeParse(fractional).success).toBe(false);
  });

  it('rejects a confidence outside low, medium and high', () => {
    const doc = { ...valid, predictions: [{ ...valid.predictions[0], confidence: 'certain' }] };
    expect(ReportDocument.safeParse(doc).success).toBe(false);
  });

  it('rejects a document missing a section', () => {
    expect(ReportDocument.safeParse({ ...valid, mood: undefined }).success).toBe(false);
  });
});
