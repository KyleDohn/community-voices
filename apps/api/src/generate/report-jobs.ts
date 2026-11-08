import { GenerationError, type GeneratedReport } from './generate-report';
import type { ReportRepository } from './report-repository';

export interface ReportJobsDeps {
  repo: ReportRepository;
  generate: (week: string) => Promise<GeneratedReport>;
  /** False without an API key: reading runs still works, starting one doesn't. */
  canGenerate: boolean;
}

/** Runs one report at a time in this process, so a double click can't double the spend. */
export const createReportJobs = ({ repo, generate, canGenerate }: ReportJobsDeps) => {
  let inFlight: Promise<void> | undefined;

  const execute = async (id: string, week: string) => {
    try {
      await repo.succeed(id, await generate(week));
    } catch (error) {
      if (error instanceof GenerationError) {
        await repo.fail(id, { code: error.code, message: error.message }, error.calls);
        return;
      }
      console.error(`Report ${id} crashed`, error);
      await repo.fail(
        id,
        { code: 'internal', message: 'Unexpected error; see the server log' },
        [],
      );
    }
  };

  const trigger = async (week: string) => {
    if (inFlight) return undefined;
    // Claim the slot before the first await, or two simultaneous requests both get past the check.
    const started = repo.createRun(week);
    inFlight = started
      .then((run) => execute(run.id, week))
      .catch((error: unknown) => void console.error('Report run failed to record', error))
      .finally(() => (inFlight = undefined));
    return { id: (await started).id };
  };

  return {
    canGenerate,
    trigger,
    get: repo.getRun,
    list: repo.listRuns,
    /** Resolves when no run is in flight; for tests and shutdown. */
    settled: () => inFlight ?? Promise.resolve(),
  };
};

export type ReportJobs = ReturnType<typeof createReportJobs>;
