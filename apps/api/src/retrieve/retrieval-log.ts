/** Where retrievals are recorded, so stats can count what was retrieved; Postgres in the app. */
export interface RetrievalEntry {
  chunkId: number;
  /** The facet id, or the theme text for a trend lookup. */
  query: string;
  rank: number;
  score: number;
}

export interface RetrievalLog {
  /** Stores the entries under a new run and returns its id. */
  record(weekStart: string, entries: RetrievalEntry[]): Promise<string>;
  entriesFor(runId: string): Promise<RetrievalEntry[]>;
}
