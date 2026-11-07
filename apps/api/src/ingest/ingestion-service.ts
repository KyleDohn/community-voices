import { type ChunkOptions, chunkTopic } from './chunk';
import { type ForumSource, RequestCapReached, type TimeWindow } from './forum-source';
import type {
  IngestionProgress,
  IngestionRepository,
  IngestionRun,
  IngestionStatus,
} from './ingestion-run';

export interface RunCaps {
  maxRequests: number;
  maxTokens: number;
}

export interface IngestionServiceDeps {
  repo: IngestionRepository;
  /** A fresh source per run, so each run gets its own request budget. */
  sourceFor: (maxRequests: number) => ForumSource;
  chunkOptions: ChunkOptions;
}

/** About 4 characters per token for English markdown; close enough for a budget. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export const createIngestionService = ({ repo, sourceFor, chunkOptions }: IngestionServiceDeps) => {
  const start = (input: { window: TimeWindow; maxRequests: number; maxTokens: number }) =>
    repo.createRun(input);

  /**
   * Runs, or resumes, an ingestion. Progress is saved after each topic, so a stop loses nothing.
   * Caps apply to the whole run; pass raised `caps` to resume a run that hit one.
   */
  const ingest = async (runId: string, caps?: RunCaps): Promise<IngestionRun> => {
    const stored = await repo.getRun(runId);
    if (!stored) throw new Error(`No ingestion run ${runId}`);
    const run = { ...stored, ...caps };
    const progress: IngestionProgress = { ...run, status: 'running', error: null };
    const done = new Set(progress.doneTopicIds);
    const save = async (patch: Partial<IngestionProgress>) => {
      Object.assign(progress, patch);
      await repo.updateRun(runId, patch);
    };
    const finish = async (status: IngestionStatus, error: string | null = null) => {
      await save({ status, error });
      return { ...run, ...progress };
    };
    await save({ status: 'running', error: null });
    if (caps) await repo.updateRun(runId, caps);

    try {
      const source = sourceFor(run.maxRequests);
      const active = await source.listActiveTopics(run.window.start);
      for (const { id } of active) {
        if (done.has(id)) continue;
        if (progress.tokensUsed >= run.maxTokens) return finish('capped');

        const { topic, posts } = await source.fetchTopic(id, run.window);
        const chunks = chunkTopic(topic, posts, chunkOptions);
        if (posts.length > 0) await repo.saveTopic(topic, posts, chunks);
        done.add(id);
        await save({
          doneTopicIds: [...done],
          topicsStored: progress.topicsStored + (posts.length > 0 ? 1 : 0),
          postsStored: progress.postsStored + posts.length,
          chunksStored: progress.chunksStored + chunks.length,
          tokensUsed:
            progress.tokensUsed + posts.reduce((sum, p) => sum + estimateTokens(p.raw), 0),
        });
      }
      return finish('succeeded');
    } catch (error) {
      if (error instanceof RequestCapReached) return finish('capped');
      const message = error instanceof Error ? error.message : String(error);
      return finish('failed', message);
    }
  };

  return { start, ingest };
};
