import type { CostStatsResponse, RetrievalStatsResponse } from '@cv/contracts';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';

export interface StatsRepository {
  /** `facetIds` tell facet picks from trend examples: a trend row's query is the theme text. */
  mostRetrievedPosts(options: {
    limit: number;
    facetIds: string[];
  }): Promise<RetrievalStatsResponse>;
  runCosts(): Promise<CostStatsResponse>;
}

type PostRow = {
  post_id: number;
  topic_title: string | null;
  url: string | null;
  week_start: string | null;
  runs: number;
  facet_hits: number;
  trend_hits: number;
  last_retrieved_at: Date;
};

type CostRow = {
  kind: 'ab' | 'report';
  id: string;
  week_start: string;
  status: 'running' | 'succeeded' | 'failed';
  is_sample: boolean;
  cost_usd: number;
  created_at: Date;
};

const isFacet = (facetIds: string[]) =>
  facetIds.length === 0
    ? sql`false`
    : sql`x.query in (${sql.join(
        facetIds.map((id) => sql`${id}`),
        sql`, `,
      )})`;

export const createPgStatsRepository = (db: Database): StatsRepository => ({
  mostRetrievedPosts: async ({ limit, facetIds }) => {
    // Grouped by post, not chunk: chunk ids go null after re-ingestion (ASSUMPTIONS #24, #33).
    const { rows } = await db.execute<PostRow>(sql`
      select x.post_id,
             t.title as topic_title,
             p.url,
             to_char(date_trunc('week', p.created_at at time zone 'UTC'), 'YYYY-MM-DD') as week_start,
             count(distinct x.run_id)::int as runs,
             (count(*) filter (where ${isFacet(facetIds)}))::int as facet_hits,
             (count(*) filter (where not ${isFacet(facetIds)}))::int as trend_hits,
             max(r.created_at) as last_retrieved_at
        from retrievals x
        join retrieval_runs r on r.id = x.run_id
        left join posts p on p.id = x.post_id
        left join topics t on t.id = p.topic_id
       group by x.post_id, t.title, p.url, p.created_at
       order by runs desc, count(*) desc, last_retrieved_at desc, x.post_id
       limit ${limit}`);
    const [{ total }] = (
      await db.execute<{ total: number }>(sql`select count(*)::int as total from retrieval_runs`)
    ).rows as [{ total: number }];
    return {
      totalRuns: total,
      posts: rows.map((r) => ({
        postId: r.post_id,
        topicTitle: r.topic_title,
        url: r.url,
        weekStart: r.week_start,
        runs: r.runs,
        facetHits: r.facet_hits,
        trendHits: r.trend_hits,
        lastRetrievedAt: new Date(r.last_retrieved_at).toISOString(),
      })),
    };
  },

  runCosts: async () => {
    // A report an A/B run made is already inside that run's cost (ASSUMPTIONS #34).
    const { rows } = await db.execute<CostRow>(sql`
      select 'ab' as kind, id, week_start::text, status, is_sample, cost_usd, created_at
        from ab_runs
      union all
      select 'report', id, week_start::text, status, is_sample, cost_usd, created_at
        from reports
       where not exists (select 1 from ab_runs a where a.report_id = reports.id)
       order by created_at desc`);
    const runs = rows.map((r) => ({
      kind: r.kind,
      id: r.id,
      weekStart: r.week_start,
      status: r.status,
      isSample: r.is_sample,
      costUsd: r.cost_usd,
      createdAt: new Date(r.created_at).toISOString(),
    }));
    return { runs, totalUsd: runs.reduce((sum, r) => sum + r.costUsd, 0) };
  },
});
