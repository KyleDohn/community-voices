import { createIngestionJobs, type IngestionJobsDeps } from '../ingestion-jobs';
import { createIngestionService } from '../ingestion-service';
import { createFakeForumSource, scriptedTopic } from './fake-forum-source';
import { createMemoryIngestionRepository } from './memory-ingestion-repository';

/** Real job runner over an in-memory repo and a one-topic fake forum. */
export const fakeIngestionJobs = (options: Pick<IngestionJobsDeps, 'afterRun'> = {}) => {
  const { repo } = createMemoryIngestionRepository();
  const { source } = createFakeForumSource([scriptedTopic(1, [])]);
  const service = createIngestionService({
    repo,
    sourceFor: () => source,
    chunkOptions: { maxWords: 300, overlapWords: 40, minWords: 15 },
  });
  return createIngestionJobs({
    service,
    getRun: repo.getRun,
    newRun: () => ({
      window: { start: new Date('2026-11-02T00:00:00Z'), end: new Date('2026-11-09T00:00:00Z') },
      maxRequests: 10,
      maxTokens: 1000,
    }),
    ...options,
  });
};
