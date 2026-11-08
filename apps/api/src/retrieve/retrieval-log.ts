/** Where retrievals are recorded, so stats can count what was retrieved; Postgres in the app. */
export interface RetrievalEntry {
  chunkId: number;
  postId: number;
  /** The facet id, or the theme text for a trend lookup. */
  query: string;
  rank: number;
  score: number;
}

/** An entry as stored: `chunkId` is null once re-ingestion has dropped that chunk. */
export type LoggedRetrieval = Omit<RetrievalEntry, 'chunkId'> & { chunkId: number | null };

export interface RetrievalLog {
  /** Stores the entries under a new run and returns its id. */
  record(weekStart: string, entries: RetrievalEntry[]): Promise<string>;
  entriesFor(runId: string): Promise<LoggedRetrieval[]>;
}
