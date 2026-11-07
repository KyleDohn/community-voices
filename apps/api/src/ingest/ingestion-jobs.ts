import type { TimeWindow } from './forum-source';
import type { IngestionRun } from './ingestion-run';
import type { createIngestionService } from './ingestion-service';

export interface IngestionJobsDeps {
  service: ReturnType<typeof createIngestionService>;
  getRun: (id: string) => Promise<IngestionRun | undefined>;
  /** Window and caps for a run started now. */
  newRun: () => { window: TimeWindow; maxRequests: number; maxTokens: number };
  /** Runs after every run, e.g. to embed the chunks it stored. */
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
        .then(afterRun)
        .catch((error: unknown) => void console.error(`After ingestion ${id}`, error))
        .finally(release);
      return { id, done };
    });
    inFlight = started.catch(release);
    return started;
  };

  return { trigger, get: getRun };
};

export type IngestionJobs = ReturnType<typeof createIngestionJobs>;
