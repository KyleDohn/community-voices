import type { MapPoint } from '@cv/contracts';
import { describe, expect, it, vi } from 'vitest';
import { corpusVersion } from './corpus-version';
import { createMapProjector, type MapStore, type StoredPoint } from './map-projector';
import type { Point2d } from './project-vectors';

const model = 'bge';

const fakeStore = (storedVersion?: string) => {
  const state = {
    version: storedVersion,
    points: [] as StoredPoint[],
    vectors: [
      { id: 1, embedding: [0, 1] },
      { id: 2, embedding: [1, 0] },
    ],
  };
  const store: MapStore = {
    embeddedVectors: async () => state.vectors,
    storedVersion: async () => state.version,
    replace: async (version, points) => {
      state.version = version;
      state.points = points;
    },
    points: async () => [] as MapPoint[],
  };
  return { store, state };
};

const fakeProject = () =>
  vi.fn(async (input: number[][]): Promise<Point2d[]> => input.map((_, i) => ({ x: i, y: -i })));

describe('createMapProjector', () => {
  it('is computing until the first refresh finishes', () => {
    const { store } = fakeStore();
    expect(createMapProjector({ store, project: fakeProject(), model }).status()).toBe('computing');
  });

  it('projects and stores the points when the corpus changed', async () => {
    const { store, state } = fakeStore('stale');
    const project = fakeProject();
    const projector = createMapProjector({ store, project, model });
    await projector.refresh();
    expect(project).toHaveBeenCalledWith(
      [
        [0, 1],
        [1, 0],
      ],
      { seed: expect.any(Number) },
    );
    expect(state).toMatchObject({
      version: corpusVersion(model, [1, 2]),
      points: [
        { chunkId: 1, x: 0, y: -0 },
        { chunkId: 2, x: 1, y: -1 },
      ],
    });
    expect(projector.status()).toBe('ready');
  });

  it('skips the projection when the stored version matches', async () => {
    const { store } = fakeStore(corpusVersion(model, [1, 2]));
    const project = fakeProject();
    const projector = createMapProjector({ store, project, model });
    await projector.refresh();
    expect(project).not.toHaveBeenCalled();
    expect(projector.status()).toBe('ready');
  });

  it('reports failed when the projection throws, and recovers on the next refresh', async () => {
    const { store } = fakeStore();
    const project = fakeProject().mockRejectedValueOnce(new Error('boom'));
    const projector = createMapProjector({ store, project, model });
    await expect(projector.refresh()).rejects.toThrow('boom');
    expect(projector.status()).toBe('failed');
    await projector.refresh();
    expect(projector.status()).toBe('ready');
  });

  it('runs overlapping refreshes one after another, so an unchanged corpus projects once', async () => {
    const { store } = fakeStore();
    const project = fakeProject();
    const projector = createMapProjector({ store, project, model });
    await Promise.all([projector.refresh(), projector.refresh()]);
    expect(project).toHaveBeenCalledTimes(1);
  });

  it('is computing again while a later refresh runs', async () => {
    const { store, state } = fakeStore();
    let release = () => {};
    const project = fakeProject();
    const projector = createMapProjector({ store, project, model });
    await projector.refresh();
    project.mockImplementationOnce(
      () =>
        new Promise(
          (resolve) =>
            (release = () =>
              resolve([
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ])),
        ),
    );
    state.vectors.push({ id: 3, embedding: [1, 1] });
    const running = projector.refresh();
    await vi.waitFor(() => expect(project).toHaveBeenCalledTimes(2));
    expect(projector.status()).toBe('computing');
    release();
    await running;
    expect(projector.status()).toBe('ready');
  });
});
