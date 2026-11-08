import { asc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { retrievalRuns, retrievals } from '../db/schema';

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

export const createPgRetrievalLog = (db: Database): RetrievalLog => ({
  record: (weekStart, entries) =>
    db.transaction(async (tx) => {
      const [run] = await tx.insert(retrievalRuns).values({ weekStart }).returning();
      if (entries.length > 0) {
        await tx.insert(retrievals).values(entries.map((e) => ({ ...e, runId: run!.id })));
      }
      return run!.id;
    }),

  entriesFor: (runId) =>
    db
      .select({
        chunkId: retrievals.chunkId,
        query: retrievals.query,
        rank: retrievals.rank,
        score: retrievals.score,
      })
      .from(retrievals)
      .where(eq(retrievals.runId, runId))
      .orderBy(asc(retrievals.id)),
});
