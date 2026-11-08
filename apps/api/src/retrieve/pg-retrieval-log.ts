import { asc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { retrievalRuns, retrievals } from '../db/schema';
import type { RetrievalLog } from './retrieval-log';

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
