import type { LlmCall, ReportError, ReportRunResponse } from '@cv/contracts';
import type { GeneratedReport } from './generate-report';

/** A report run as stored; the same shape the API returns. */
export type ReportRun = ReportRunResponse;

/** Where report runs live; Postgres in the app. */
export interface ReportRepository {
  /** Starts a run in `running`. */
  createRun(weekStart: string): Promise<ReportRun>;
  getRun(id: string): Promise<ReportRun | undefined>;
  /** Newest first; every week when `weekStart` is omitted. */
  listRuns(weekStart?: string): Promise<ReportRun[]>;
  succeed(id: string, report: GeneratedReport): Promise<void>;
  /** `calls` are the ones already paid for, so a failed run still shows its cost. */
  fail(id: string, error: ReportError, calls: LlmCall[]): Promise<void>;
  /** Fails runs a previous process left running; returns how many. Call once at boot. */
  failInterruptedRuns(): Promise<number>;
}

export const INTERRUPTED: ReportError = {
  code: 'interrupted',
  message: 'Interrupted by a restart',
};
