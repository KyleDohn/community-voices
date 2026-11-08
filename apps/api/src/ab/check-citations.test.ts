import type { ReportDocument } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { checkCitations } from './check-citations';

const week = '2026-10-26';
const postWeek = new Map([
  [1, week],
  [2, week],
  [3, week],
  [7, '2026-10-19'],
  [9, '2026-11-02'],
]);
const retrieved = new Set([1, 2, 7]);

const doc = (overrides: Partial<ReportDocument> = {}): ReportDocument => ({
  themes: [{ title: 't', summary: 's', approxPostCount: 3, citations: [1, 2] }],
  notableThreads: [{ title: 'n', why: 'w', citations: [2] }],
  mood: { summary: 'm', citations: [1] },
  predictions: [{ claim: 'c', rationale: 'r', confidence: 'low', citations: [1] }],
  ...overrides,
});

const check = (document: ReportDocument) => checkCitations(document, { week, postWeek, retrieved });

describe('checkCitations', () => {
  it('finds nothing wrong in a document that cites retrieved target-week posts', () => {
    expect(check(doc())).toEqual({
      claims: 4,
      uncitedClaims: 0,
      citations: 5,
      notInCorpus: [],
      outsideWeek: [],
      notRetrieved: [],
    });
  });

  it('counts claims with no citation, the mood included', () => {
    const result = check(
      doc({
        themes: [
          { title: 'a', summary: 's', approxPostCount: 1, citations: [] },
          { title: 'b', summary: 's', approxPostCount: 1, citations: [1] },
        ],
        mood: { summary: 'm', citations: [] },
      }),
    );
    expect(result).toMatchObject({ claims: 5, uncitedClaims: 2 });
  });

  it('lists invented ids once each, sorted', () => {
    const result = check(
      doc({ notableThreads: [{ title: 'n', why: 'w', citations: [999, 42, 999] }] }),
    );
    expect(result.notInCorpus).toEqual([42, 999]);
    expect(result.citations).toBe(7);
  });

  it('flags real posts from another week outside predictions', () => {
    const result = check(doc({ notableThreads: [{ title: 'n', why: 'w', citations: [7, 9] }] }));
    expect(result.outsideWeek).toEqual([7, 9]);
  });

  it('lets predictions cite earlier weeks, but not later ones', () => {
    const result = check(
      doc({ predictions: [{ claim: 'c', rationale: 'r', confidence: 'low', citations: [7, 9] }] }),
    );
    expect(result.outsideWeek).toEqual([9]);
  });

  it('lists real posts the RAG writer never saw', () => {
    const result = check(doc({ mood: { summary: 'm', citations: [3, 999] } }));
    expect(result.notRetrieved).toEqual([3]);
  });
});
