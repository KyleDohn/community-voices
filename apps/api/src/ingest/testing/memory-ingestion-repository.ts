import type { ForumPost, ForumTopic } from '../forum-source';
import type { ChunkRecord, IngestionRepository, IngestionRun, SavedTopic } from '../ingestion-run';

/** In-memory stand-in for the Postgres repository, for unit tests of the service's control flow. */
export const createMemoryIngestionRepository = () => {
  const runs = new Map<string, IngestionRun>();
  const topics = new Map<number, ForumTopic>();
  const posts = new Map<number, ForumPost>();
  const chunks = new Map<string, ChunkRecord>();

  // Mirrors the Postgres upsert: a re-saved post replaces all of its chunks.
  const save = ({ topic, posts: topicPosts, chunks: topicChunks }: SavedTopic) => {
    topics.set(topic.id, topic);
    for (const post of topicPosts) {
      posts.set(post.id, post);
      for (const key of chunks.keys()) if (key.startsWith(`${post.id}:`)) chunks.delete(key);
    }
    for (const chunk of topicChunks) chunks.set(`${chunk.postId}:${chunk.chunkIndex}`, chunk);
  };

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
    saveTopic: async (topic, topicPosts, topicChunks) =>
      save({ topic, posts: topicPosts, chunks: topicChunks }),
    saveCorpus: async (corpus) => corpus.forEach(save),
    exportCorpus: async () => ({
      topics: [...topics.values()].sort((a, b) => a.id - b.id),
      posts: [...posts.values()].sort((a, b) => a.id - b.id),
    }),
    corpusCounts: async () => ({ topics: topics.size, posts: posts.size, chunks: chunks.size }),
  };
  return { repo, topics, posts, chunks };
};
