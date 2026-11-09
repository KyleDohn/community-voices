import type { MapPoint } from '@cv/contracts';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { chunks, mapPoints } from '../db/schema';
import type { MapStore } from './map-projector';

// Four parameters per row; batches stay far below Postgres's 65,535-parameter limit.
const INSERT_BATCH = 1000;

type PointRow = Omit<MapPoint, 'chunkId' | 'postId' | 'topicTitle' | 'postNumber' | 'weekStart'> & {
  chunk_id: number;
  post_id: number;
  topic_title: string;
  post_number: number;
  week_start: string;
};

export const createPgMapStore = (db: Database): MapStore => ({
  embeddedVectors: async (model) => {
    const rows = await db
      .select({ id: chunks.id, embedding: chunks.embedding })
      .from(chunks)
      .where(and(isNotNull(chunks.embedding), eq(chunks.embeddingModel, model)))
      .orderBy(asc(chunks.id));
    return rows.map((r) => ({ id: r.id, embedding: r.embedding! }));
  },

  storedVersion: async () => {
    const [row] = await db.select({ v: mapPoints.corpusVersion }).from(mapPoints).limit(1);
    return row?.v;
  },

  replace: (version, points) =>
    db.transaction(async (tx) => {
      await tx.delete(mapPoints);
      for (let i = 0; i < points.length; i += INSERT_BATCH) {
        const batch = points.slice(i, i + INSERT_BATCH);
        await tx.insert(mapPoints).values(batch.map((p) => ({ ...p, corpusVersion: version })));
      }
    }),

  points: async () => {
    const { rows } = await db.execute<PointRow>(sql`
      with runs as (
        select post_id, count(distinct run_id)::int as runs from retrievals group by post_id
      )
      select m.chunk_id, c.post_id, m.x, m.y, to_char(c.week_start, 'YYYY-MM-DD') as week_start,
        t.title as topic_title, p.post_number, p.url, coalesce(r.runs, 0) as runs
      from map_points m
      join chunks c on c.id = m.chunk_id
      join posts p on p.id = c.post_id
      join topics t on t.id = p.topic_id
      left join runs r on r.post_id = c.post_id
      order by m.chunk_id`);
    return rows.map((r) => ({
      chunkId: r.chunk_id,
      postId: r.post_id,
      x: r.x,
      y: r.y,
      weekStart: r.week_start,
      topicTitle: r.topic_title,
      postNumber: r.post_number,
      url: r.url,
      runs: r.runs,
    }));
  },
});
