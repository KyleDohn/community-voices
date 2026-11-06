import type { IngestConfig } from '../config';
import type { Database } from '../db/client';
import { createDiscourseSource } from './discourse/discourse-source';
import type { ForumSource } from './forum-source';
import { createIngestionService } from './ingestion-service';
import { createPgIngestionRepository } from './pg-ingestion-repository';

/** Builds the real ingestion service. `decorate` lets the CLI observe the source, e.g. to log progress. */
export const createIngestion = (
  config: IngestConfig,
  db: Database,
  decorate: (source: ForumSource) => ForumSource = (source) => source,
) =>
  createIngestionService({
    repo: createPgIngestionRepository(db),
    chunkOptions: config.chunk,
    sourceFor: (maxRequests) =>
      decorate(
        createDiscourseSource({
          baseUrl: config.discourseBaseUrl,
          userAgent: config.userAgent,
          minIntervalMs: config.minIntervalMs,
          maxRequests,
        }),
      ),
  });
