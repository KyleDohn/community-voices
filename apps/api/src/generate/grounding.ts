import type { PostId, ReportDocument } from '@cv/contracts';

/** Post ids the writer saw: target-week context, and prior-week trend examples. */
export interface AllowedCitations {
  targetWeek: ReadonlySet<PostId>;
  priorWeeks: ReadonlySet<PostId>;
}

interface Section {
  path: string;
  citations: PostId[];
  /** Predictions rest on trends, whose evidence is in earlier weeks. */
  mayCitePriorWeeks: boolean;
}

const sectionsOf = (doc: ReportDocument): Section[] => [
  ...doc.themes.map((t, i) => ({
    path: `themes[${i}]`,
    citations: t.citations,
    mayCitePriorWeeks: false,
  })),
  ...doc.notableThreads.map((t, i) => ({
    path: `notableThreads[${i}]`,
    citations: t.citations,
    mayCitePriorWeeks: false,
  })),
  { path: 'mood', citations: doc.mood.citations, mayCitePriorWeeks: false },
  ...doc.predictions.map((p, i) => ({
    path: `predictions[${i}]`,
    citations: p.citations,
    mayCitePriorWeeks: true,
  })),
];

const problemWith = (id: PostId, section: Section, allowed: AllowedCitations) => {
  if (allowed.targetWeek.has(id)) return undefined;
  if (allowed.priorWeeks.has(id)) {
    return section.mayCitePriorWeeks
      ? undefined
      : 'is a prior-week trend example; only predictions may cite those';
  }
  return 'was not in the supplied posts';
};

/** Readable errors for citations outside what the writer was given; empty when grounded. */
export const validateGrounding = (doc: ReportDocument, allowed: AllowedCitations): string[] =>
  sectionsOf(doc).flatMap((section) =>
    section.citations.flatMap((id) => {
      const problem = problemWith(id, section, allowed);
      return problem ? [`${section.path}.citations: post ${id} ${problem}`] : [];
    }),
  );
