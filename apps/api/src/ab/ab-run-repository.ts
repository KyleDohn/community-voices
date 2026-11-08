import type { AbRunResponse, LlmCall, ReportError } from '@cv/contracts';
import type { AbResult } from './run-ab';

/** An A/B run as stored: the response minus its report, which lives in `reports`. */
export type AbRun = Omit<AbRunResponse, 'ragReport'> & { reportId: string | null };

/** What a finished run adds; the report is linked separately, as soon as it exists. */
export type AbOutcome = Pick<AbResult, 'noRag' | 'checks' | 'rubric' | 'pairwise' | 'calls'>;

/** Where A/B runs live; Postgres in the app. */
export interface AbRunRepository {
  /** Starts a run in `running`. */
  createRun(weekStart: string): Promise<AbRun>;
  getRun(id: string): Promise<AbRun | undefined>;
  /** Newest first. */
  listRuns(): Promise<AbRun[]>;
  linkReport(id: string, reportId: string): Promise<void>;
  succeed(id: string, outcome: AbOutcome): Promise<void>;
  /** `calls` are the ones already paid for, so a failed run still shows its cost. */
  fail(id: string, error: ReportError, calls: LlmCall[]): Promise<void>;
  /** Fails runs a previous process left running; returns how many. Call once at boot. */
  failInterruptedRuns(): Promise<number>;
}
