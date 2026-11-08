import type { SearchHit } from '../embed/embedding-store';
import type { RetrievalDeps } from './retrieve-week';

export interface TrendOptions {
  /** Monday, `YYYY-MM-DD`. */
  week: string;
  /** Earlier Mondays to compare against, newest first. */
  priorWeeks: string[];
  themes: string[];
  /** Chunks closest to the theme across all the weeks; each week's count is its share of these. */
  poolSize: number;
  examplesPerWeek: number;
}

export interface WeekTrend {
  weekStart: string;
  /** How many of the pooled nearest chunks fall in this week. */
  matches: number;
  /** The week's closest matches, best first. */
  examples: SearchHit[];
}

export interface ThemeTrend {
  theme: string;
  /** The target week first, then the prior weeks. */
  weeks: WeekTrend[];
}

/**
 * Bge scores are too bunched for a fixed threshold, so a "match" is rank-based: a chunk among the
 * poolSize nearest to the theme across all weeks. A week's own top poolSize always holds the
 * global top poolSize's members from that week, so one search per week is enough.
 */
export const trendLookup = (
  { embedder, search }: RetrievalDeps,
  { week, priorWeeks, themes, poolSize, examplesPerWeek }: TrendOptions,
): Promise<ThemeTrend[]> =>
  Promise.all(
    themes.map(async (theme) => {
      const vector = await embedder.embedQuery(theme);
      const weeks = [week, ...priorWeeks];
      const perWeek = await Promise.all(
        weeks.map((weekStart) =>
          search.search({ model: embedder.model, weekStart, vector, k: poolSize }),
        ),
      );
      const pool = new Set(
        perWeek
          .flat()
          .sort((a: SearchHit, b: SearchHit) => b.score - a.score)
          .slice(0, poolSize),
      );
      return {
        theme,
        weeks: weeks.map((weekStart, i) => {
          const matches = perWeek[i]!.filter((hit) => pool.has(hit));
          return {
            weekStart,
            matches: matches.length,
            examples: matches.slice(0, examplesPerWeek),
          };
        }),
      };
    }),
  );
