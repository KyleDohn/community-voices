import { fakeAbJobs } from '../../ab/testing/fake-ab-jobs';
import { fakeReportJobs } from '../../generate/testing/fake-report-jobs';
import { fakeIngestionJobs } from '../../ingest/testing/fake-ingestion-jobs';
import type { AppDependencies } from '../app';

/** Healthy fakes for every boundary; each test overrides only the one it exercises. */
export const testDependencies = (overrides: Partial<AppDependencies> = {}): AppDependencies => ({
  probeDatabase: async () => true,
  embedderStatus: () => 'ready',
  ingestions: fakeIngestionJobs(),
  listWeeks: async () => [],
  reports: fakeReportJobs(),
  abRuns: fakeAbJobs(),
  stats: {
    retrievals: async () => ({ totalRuns: 0, posts: [] }),
    costs: async () => ({ runs: [], totalUsd: 0 }),
  },
  ...overrides,
});
