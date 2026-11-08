import type { CitationChecks, ReportDocument } from '@cv/contracts';

export interface CitationContext {
  /** The target week, `YYYY-MM-DD`. */
  week: string;
  /** Every post in the corpus, by id, mapped to its week. */
  postWeek: ReadonlyMap<number, string>;
  /** Posts the RAG writer saw (its report's sources). */
  retrieved: ReadonlySet<number>;
}

const sortedUnique = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);

/** Counts citation problems without rejecting anything; both variants are measured the same way. */
export const checkCitations = (
  document: ReportDocument,
  { week, postWeek, retrieved }: CitationContext,
): CitationChecks => {
  const claims = [
    ...document.themes.map((t) => ({ ids: t.citations, prediction: false })),
    ...document.notableThreads.map((t) => ({ ids: t.citations, prediction: false })),
    { ids: document.mood.citations, prediction: false },
    ...document.predictions.map((p) => ({ ids: p.citations, prediction: true })),
  ];
  const cited = claims.flatMap(({ ids, prediction }) => ids.map((id) => ({ id, prediction })));
  const real = cited.filter(({ id }) => postWeek.has(id));

  return {
    claims: claims.length,
    uncitedClaims: claims.filter(({ ids }) => ids.length === 0).length,
    citations: cited.length,
    notInCorpus: sortedUnique(cited.filter(({ id }) => !postWeek.has(id)).map(({ id }) => id)),
    outsideWeek: sortedUnique(
      real
        .filter(({ id, prediction }) => {
          const postWeekStart = postWeek.get(id)!;
          // A prediction rests on a trend, whose evidence is in earlier weeks.
          return prediction ? postWeekStart > week : postWeekStart !== week;
        })
        .map(({ id }) => id),
    ),
    notRetrieved: sortedUnique(real.filter(({ id }) => !retrieved.has(id)).map(({ id }) => id)),
  };
};
