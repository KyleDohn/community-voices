import type { MapPoint, MapStatus } from '@cv/contracts';
import { corpusVersion } from './corpus-version';
import type { Point2d } from './project-vectors';

export interface StoredPoint {
  chunkId: number;
  x: number;
  y: number;
}

export interface MapStore {
  /** Embedded chunks for one model, ordered by id. */
  embeddedVectors(model: string): Promise<{ id: number; embedding: number[] }[]>;
  storedVersion(): Promise<string | undefined>;
  /** Swaps every stored point for these, atomically. */
  replace(version: string, points: StoredPoint[]): Promise<void>;
  points(): Promise<MapPoint[]>;
}

export interface MapProjectorDeps {
  store: MapStore;
  project: (vectors: number[][], options: { seed: number }) => Promise<Point2d[]>;
  model: string;
}

// Fixed, so the same corpus always lands on the same layout.
const SEED = 42;

/** Keeps `map_points` in step with the embedded corpus; refreshes queue behind each other. */
export const createMapProjector = ({ store, project, model }: MapProjectorDeps) => {
  let status: MapStatus = 'computing';
  let queue: Promise<unknown> = Promise.resolve();

  const projectIfChanged = async () => {
    try {
      const vectors = await store.embeddedVectors(model);
      const version = corpusVersion(model, vectors);
      if ((await store.storedVersion()) !== version) {
        // Only a real re-projection hides the map; a no-op refresh keeps serving it.
        status = 'computing';
        const points = await project(
          vectors.map((v) => v.embedding),
          { seed: SEED },
        );
        await store.replace(
          version,
          points.map((p, i) => ({ chunkId: vectors[i]!.id, ...p })),
        );
      }
      status = 'ready';
    } catch (error) {
      status = 'failed';
      throw error;
    }
  };

  const refresh = () => {
    const pass = queue.then(projectIfChanged);
    queue = pass.catch(() => undefined);
    return pass;
  };

  return { status: () => status, refresh, points: () => store.points() };
};

export type MapProjector = ReturnType<typeof createMapProjector>;
