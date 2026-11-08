import { createMemoryReportRepository } from '../../generate/testing/memory-report-repository';
import { type AbJobsDeps, createAbJobs } from '../ab-jobs';
import { createMemoryAbRunRepository } from './memory-ab-run-repository';

/** Real job runner over in-memory repos; `run` is scripted by the test. */
export const fakeAbJobs = (options: Partial<Omit<AbJobsDeps, 'repo' | 'reports'>> = {}) =>
  createAbJobs({
    repo: createMemoryAbRunRepository(),
    reports: createMemoryReportRepository(),
    run: () => Promise.reject(new Error('No scripted A/B run')),
    canGenerate: true,
    ...options,
  });
