import type { ForumPost, ForumTopic } from '../forum-source';
import type { ChunkRecord, IngestionRepository, IngestionRun } from '../ingestion-run';

/** In-memory stand-in for the Postgres repository, for unit tests of the service's control flow. */
export const createMemoryIngestionRepository = () => {
  const runs = new Map<string, IngestionRun>();
  const topics = new Map<number, ForumTopic>();
  const posts = new Map<number, ForumPost>();
  const chunks = new Map<string, ChunkRecord>();

  const repo: IngestionRepository = {
    createRun: async ({ window, maxRequests, maxTokens }) => {
      const run: IngestionRun = {
        id: `run-${runs.size + 1}`,
        window,
        maxRequests,
        maxTokens,
        status: 'queued',
        doneTopicIds: [],
        topicsStored: 0,
        postsStored: 0,
        chunksStored: 0,
        tokensUsed: 0,
        error: null,
      };
      runs.set(run.id, run);
      return { ...run };
    },
    getRun: async (id) => {
      const run = runs.get(id);
      return run && { ...run };
    },
    updateRun: async (id, progress) => {
      const run = runs.get(id);
      if (run) runs.set(id, { ...run, ...progress });
    },
    saveTopic: async (topic, topicPosts, topicChunks) => {
      topics.set(topic.id, topic);
      for (const post of topicPosts) posts.set(post.id, post);
      for (const chunk of topicChunks) chunks.set(`${chunk.postId}:${chunk.chunkIndex}`, chunk);
    },
  };
  return { repo, topics, posts, chunks };
};
