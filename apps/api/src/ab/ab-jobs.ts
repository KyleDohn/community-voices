import type { AbRunResponse, LlmCall } from '@cv/contracts';
import { GenerationError } from '../generate/caller';
import type { ReportRepository } from '../generate/report-repository';
import type { AbRunRepository } from './ab-run-repository';
import type { AbOptions, AbResult } from './run-ab';

export interface AbJobsDeps {
  repo: AbRunRepository;
  /** Where the run's RAG report is stored, as an ordinary report run. */
  reports: ReportRepository;
  run: (week: string, options: AbOptions) => Promise<AbResult>;
  /** False without an API key: reading runs still works, starting one doesn't. */
  canGenerate: boolean;
}

/** Runs one A/B run at a time in this process, so a double click can't double the spend. */
export const createAbJobs = ({ repo, reports, run, canGenerate }: AbJobsDeps) => {
  let inFlight: Promise<void> | undefined;

  const execute = async (id: string, week: string) => {
    // Once the run returns, its calls are paid for even if storing the result fails.
    let paid: LlmCall[] = [];
    try {
      const result = await run(week, {
        onReport: async (report) => {
          const stored = await reports.createRun(week);
          await reports.succeed(stored.id, report);
          await repo.linkReport(id, stored.id);
        },
      });
      paid = result.calls;
      await repo.succeed(id, result);
    } catch (error) {
      if (error instanceof GenerationError) {
        await repo.fail(id, { code: error.code, message: error.message }, error.calls);
        return;
      }
      console.error(`A/B run ${id} crashed`, error);
      await repo.fail(
        id,
        { code: 'internal', message: 'Unexpected error; see the server log' },
        paid,
      );
    }
  };

  const trigger = async (week: string) => {
    if (inFlight) return undefined;
    // Claim the slot before the first await, or two simultaneous requests both get past the check.
    const started = repo.createRun(week);
    inFlight = started
      .then((r) => execute(r.id, week))
      .catch((error: unknown) => void console.error('A/B run failed to record', error))
      .finally(() => (inFlight = undefined));
    return { id: (await started).id };
  };

  /** The stored run with its RAG report embedded. */
  const get = async (id: string): Promise<AbRunResponse | undefined> => {
    const stored = await repo.getRun(id);
    if (!stored) return undefined;
    const { reportId, ...rest } = stored;
    return { ...rest, ragReport: (reportId && (await reports.getRun(reportId))) || null };
  };

  return {
    canGenerate,
    trigger,
    get,
    list: repo.listRuns,
    /** Resolves when no run is in flight; for tests and shutdown. */
    settled: () => inFlight ?? Promise.resolve(),
  };
};

export type AbJobs = ReturnType<typeof createAbJobs>;
