import type { TimeWindow } from './forum-source';
import type { IngestionRun } from './ingestion-run';
import type { createIngestionService } from './ingestion-service';

export interface IngestionJobsDeps {
  service: ReturnType<typeof createIngestionService>;
  getRun: (id: string) => Promise<IngestionRun | undefined>;
  /** Window and caps for a run started now. */
  newRun: () => { window: TimeWindow; maxRequests: number; maxTokens: number };
  /** Runs after every run, once its slot is free; `done` waits for it. */
  afterRun?: () => Promise<unknown>;
}

/** Runs one ingestion at a time in this process; two concurrent runs would only double forum load. */
export const createIngestionJobs = ({
  service,
  getRun,
  newRun,
  afterRun = async () => undefined,
}: IngestionJobsDeps) => {
  let inFlight: Promise<unknown> | undefined;

  const release = () => (inFlight = undefined);

  const trigger = async () => {
    if (inFlight) return undefined;
    // Claim the slot before the first await, or two simultaneous requests both get past the check.
    const started = service.start(newRun()).then(({ id }) => {
      const done = service
        .ingest(id)
        .catch((error: unknown) => void console.error(`Ingestion ${id} crashed`, error))
        // Free the slot first: the hook may queue behind a long embed that isn't an ingestion.
        .finally(release)
        .then(afterRun)
        .catch((error: unknown) => void console.error(`After ingestion ${id}`, error));
      return { id, done };
    });
    inFlight = started.catch(release);
    return started;
  };

  return { trigger, get: getRun };
};

export type IngestionJobs = ReturnType<typeof createIngestionJobs>;
