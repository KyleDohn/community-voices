import { describe, expect, it } from 'vitest';
import { unitVector } from '../embed/testing/fake-embedder';
import { mmr } from './mmr';

const candidate = (id: number, score: number, vector: number[]) => ({
  id,
  score,
  vector: unitVector(vector),
});

describe('mmr', () => {
  it('keeps relevance order when lambda is 1', () => {
    const candidates = [
      candidate(2, 0.6, [0, 1, 0]),
      candidate(1, 0.9, [1, 0, 0]),
      candidate(3, 0.8, [1, 0.01, 0]),
    ];

    expect(mmr(candidates, { lambda: 1, k: 3 }).map((c) => c.id)).toEqual([1, 3, 2]);
  });
});
