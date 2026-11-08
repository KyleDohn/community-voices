import { describeReportRepositoryContract } from './testing/report-repository-contract';
import { createMemoryReportRepository } from './testing/memory-report-repository';

describeReportRepositoryContract('in-memory', async () => ({
  repo: createMemoryReportRepository(),
  retrievalRunId: 'run-1',
}));
