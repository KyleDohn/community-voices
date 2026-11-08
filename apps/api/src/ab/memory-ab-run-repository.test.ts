import { describeAbRunRepositoryContract } from './testing/ab-run-repository-contract';
import { createMemoryAbRunRepository } from './testing/memory-ab-run-repository';

describeAbRunRepositoryContract('in-memory', async () => ({
  repo: createMemoryAbRunRepository(),
  reportId: 'report-1',
}));
