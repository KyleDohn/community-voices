import type { ForumPost, ForumSource, ForumTopic } from '../forum-source';

export interface ScriptedTopic {
  topic: ForumTopic;
  posts: ForumPost[];
}

/** A forum in memory. `failOn` makes fetching that topic throw, to simulate caps and outages. */
export const createFakeForumSource = (
  topics: ScriptedTopic[],
  failOn: Map<number, Error> = new Map(),
) => {
  const fetched: number[] = [];
  const source: ForumSource = {
    listActiveTopics: async () =>
      topics.map(({ topic }) => ({ id: topic.id, bumpedAt: topic.createdAt })),
    fetchTopic: async (id, window) => {
      const error = failOn.get(id);
      if (error) throw error;
      fetched.push(id);
      const scripted = topics.find((t) => t.topic.id === id);
      if (!scripted) throw new Error(`no topic ${id}`);
      const posts = scripted.posts.filter(
        (p) => p.createdAt >= window.start && p.createdAt < window.end,
      );
      return { topic: scripted.topic, posts };
    },
  };
  return { source, fetched };
};

export const scriptedTopic = (
  id: number,
  replies: string[],
  createdAt = '2026-11-03T10:00:00Z',
): ScriptedTopic => {
  const topic: ForumTopic = {
    id,
    title: `Topic ${id}`,
    category: 'Software',
    url: `https://forum.test/t/topic-${id}/${id}`,
    createdAt: new Date(createdAt),
  };
  const bodies = [`Opening post of topic ${id} asking about export settings.`, ...replies];
  const posts = bodies.map((raw, i) => ({
    id: id * 1000 + i + 1,
    topicId: id,
    postNumber: i + 1,
    username: `user${i}`,
    raw,
    createdAt: new Date(new Date(createdAt).getTime() + i * 3_600_000),
    url: `${topic.url}/${i + 1}`,
  }));
  return { topic, posts };
};
