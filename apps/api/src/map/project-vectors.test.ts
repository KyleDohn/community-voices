import { describe, expect, it } from 'vitest';
import { projectVectors } from './project-vectors';

/** Points jittered around a center; a fixed LCG keeps the fixture deterministic. */
const cluster = (center: number, count: number, dims = 8) => {
  let s = center * 1000 + 7;
  const next = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 0.2;
  return Array.from({ length: count }, () => Array.from({ length: dims }, () => center + next()));
};

const centroid = (points: { x: number; y: number }[]) => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('projectVectors', () => {
  const vectors = [...cluster(0, 30), ...cluster(1, 30)];

  it('gives one finite point per vector, the same for the same seed', async () => {
    const first = await projectVectors(vectors, { seed: 42 });
    expect(first).toHaveLength(60);
    expect(first.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(await projectVectors(vectors, { seed: 42 })).toEqual(first);
  });

  it('keeps two separate clusters apart', async () => {
    const points = await projectVectors(vectors, { seed: 42 });
    const [a, b] = [points.slice(0, 30), points.slice(30)];
    const spread = Math.max(
      ...a.map((p) => distance(p, centroid(a))),
      ...b.map((p) => distance(p, centroid(b))),
    );
    expect(distance(centroid(a), centroid(b))).toBeGreaterThan(2 * spread);
  });

  it.each([0, 1, 2])('handles a corpus of %i vectors', async (count) => {
    const points = await projectVectors(cluster(0, count), { seed: 42 });
    expect(points).toHaveLength(count);
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
