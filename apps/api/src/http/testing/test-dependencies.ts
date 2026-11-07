import { fakeIngestionJobs } from '../../ingest/testing/fake-ingestion-jobs';
import type { AppDependencies } from '../app';

/** Healthy fakes for every boundary; each test overrides only the one it exercises. */
export const testDependencies = (overrides: Partial<AppDependencies> = {}): AppDependencies => ({
  probeDatabase: async () => true,
  ingestions: fakeIngestionJobs(),
  ...overrides,
});
