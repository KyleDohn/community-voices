/** A topic that had activity, as cheaply listed before fetching its posts. */
export interface TopicActivity {
  id: number;
  bumpedAt: Date;
}

/** Where community posts come from. Discourse is the real one; tests use fixtures. */
export interface ForumSource {
  /** Topics with activity at or after `since`, newest activity first. */
  listActiveTopics(since: Date): Promise<TopicActivity[]>;
}

/** Thrown when a run has used its request budget; the run stops and keeps its cursor. */
export class RequestCapReached extends Error {
  constructor(readonly maxRequests: number) {
    super(`Request cap of ${maxRequests} reached`);
    this.name = 'RequestCapReached';
  }
}
