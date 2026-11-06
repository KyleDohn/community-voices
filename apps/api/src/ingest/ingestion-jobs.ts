import type { TimeWindow } from './forum-source';
import type { IngestionRun } from './ingestion-run';
import type { createIngestionService } from './ingestion-service';

export interface IngestionJobsDeps {
  service: ReturnType<typeof createIngestionService>;
  getRun: (id: string) => Promise<IngestionRun | undefined>;
  /** Window and caps for a run started now. */
  newRun: () => { window: TimeWindow; maxRequests: number; maxTokens: number };
}

/** Runs one ingestion at a time in this process; two concurrent runs would only double forum load. */
export const createIngestionJobs = ({ service, getRun, newRun }: IngestionJobsDeps) => {
  let inFlight: Promise<unknown> | undefined;

  const trigger = async () => {
    if (inFlight) return undefined;
    const { id } = await service.start(newRun());
    const done = service.ingest(id).catch((error: unknown) => {
      console.error(`Ingestion ${id} crashed`, error);
      return undefined;
    });
    inFlight = done.finally(() => (inFlight = undefined));
    return { id, done };
  };

  return { trigger, get: getRun };
};

export type IngestionJobs = ReturnType<typeof createIngestionJobs>;
