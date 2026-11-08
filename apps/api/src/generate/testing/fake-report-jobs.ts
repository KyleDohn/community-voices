import { createReportJobs, type ReportJobsDeps } from '../report-jobs';
import { createMemoryReportRepository } from './memory-report-repository';

/** Real job runner over an in-memory repo; `generate` is scripted by the test. */
export const fakeReportJobs = (options: Partial<Omit<ReportJobsDeps, 'repo'>> = {}) =>
  createReportJobs({
    repo: createMemoryReportRepository(),
    generate: () => Promise.reject(new Error('No scripted report')),
    canGenerate: true,
    ...options,
  });
