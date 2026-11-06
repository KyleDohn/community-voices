/** A topic that had activity, as cheaply listed before fetching its posts. */
export interface TopicActivity {
  id: number;
  bumpedAt: Date;
}

export interface ForumTopic {
  id: number;
  title: string;
  /** Parent and child joined, e.g. "Processing / Play Raw". */
  category: string;
  url: string;
  createdAt: Date;
}

export interface ForumPost {
  id: number;
  topicId: number;
  postNumber: number;
  username: string;
  /** Markdown as the author wrote it. */
  raw: string;
  createdAt: Date;
  url: string;
}

/** Half-open time range: `start <= t < end`. */
export interface TimeWindow {
  start: Date;
  end: Date;
}

/** Where community posts come from. Discourse is the real one; tests use fixtures. */
export interface ForumSource {
  /** Topics with activity at or after `since`, newest activity first. */
  listActiveTopics(since: Date): Promise<TopicActivity[]>;
  /** The topic and its regular posts created inside `window`, oldest first. */
  fetchTopic(id: number, window: TimeWindow): Promise<{ topic: ForumTopic; posts: ForumPost[] }>;
}

/** Thrown when a run has used its request budget; the run stops and keeps its cursor. */
export class RequestCapReached extends Error {
  constructor(readonly maxRequests: number) {
    super(`Request cap of ${maxRequests} reached`);
    this.name = 'RequestCapReached';
  }
}
