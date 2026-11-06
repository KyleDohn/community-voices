import type { ChunkDraft } from './chunk';
import type { ForumPost, ForumTopic, TimeWindow } from './forum-source';

export type IngestionStatus = 'queued' | 'running' | 'succeeded' | 'capped' | 'failed';

export interface IngestionProgress {
  status: IngestionStatus;
  /** Topics already stored. A set, because /latest reorders as people post. */
  doneTopicIds: number[];
  topicsStored: number;
  postsStored: number;
  chunksStored: number;
  tokensUsed: number;
  error: string | null;
}

export interface IngestionRun extends IngestionProgress {
  id: string;
  window: TimeWindow;
  maxRequests: number;
  maxTokens: number;
}

export interface ChunkRecord extends ChunkDraft {
  weekStart: Date;
}

export interface IngestionRepository {
  createRun(input: {
    window: TimeWindow;
    maxRequests: number;
    maxTokens: number;
  }): Promise<IngestionRun>;
  getRun(id: string): Promise<IngestionRun | undefined>;
  updateRun(id: string, progress: Partial<IngestionProgress>): Promise<void>;
  /** Idempotent upsert of a topic, its posts and their chunks. */
  saveTopic(topic: ForumTopic, posts: ForumPost[], chunks: ChunkRecord[]): Promise<void>;
}
