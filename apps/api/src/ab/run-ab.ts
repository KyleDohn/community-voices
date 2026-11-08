import type {
  CitationChecks,
  LlmCall,
  PairwiseResult,
  ReportDocument,
  RubricScores,
  Variant,
} from '@cv/contracts';
import type { LlmConfig } from '../config';
import { type Caller, createCaller, GenerationError } from '../generate/caller';
import { sumCost } from '../generate/cost';
import type { GeneratedReport } from '../generate/generate-report';
import type { LlmClient } from '../generate/llm-client';
import { checkCitations } from './check-citations';
import { judgePairwise, judgeRubric } from './judge';
import { writeNoRag } from './no-rag';

/** Which week each post id belongs to; ids with no post are absent. */
export interface Corpus {
  postWeeks(ids: number[]): Promise<Map<number, string>>;
}

export interface AbDeps {
  llm: LlmClient;
  config: LlmConfig;
  /** generateReport bound to its retrieval; it spends through the A/B run's caller. */
  generateReport(week: string, caller: Caller): Promise<GeneratedReport>;
  corpus: Corpus;
}

export interface AbOptions {
  /** Called as soon as the RAG report exists, so it is kept even if a later step fails. */
  onReport?(report: GeneratedReport): Promise<void>;
}

export interface AbResult {
  report: GeneratedReport;
  noRag: ReportDocument;
  checks: Record<Variant, CitationChecks>;
  rubric: Record<Variant, RubricScores>;
  pairwise: PairwiseResult;
  /** Every call in the run, the report's included. */
  calls: LlmCall[];
  costUsd: number;
}

const citedIds = (doc: ReportDocument) =>
  [doc.themes, doc.notableThreads, [doc.mood], doc.predictions].flat().flatMap((c) => c.citations);

/** A fresh RAG report, the no-RAG document, citation checks, then a blind rubric and pairwise judge. */
export const runAb = async (
  deps: AbDeps,
  week: string,
  { onReport }: AbOptions = {},
): Promise<AbResult> => {
  const caller = createCaller(deps, {
    usd: deps.config.maxAbRunCostUsd,
    envVar: 'MAX_AB_RUN_COST_USD',
  });
  try {
    const report = await deps.generateReport(week, caller);
    await onReport?.(report);
    const documents = { rag: report.document, no_rag: await writeNoRag(caller, week) };

    const cited = [...new Set([...citedIds(documents.rag), ...citedIds(documents.no_rag)])];
    const context = {
      week,
      postWeek: await deps.corpus.postWeeks(cited),
      retrieved: new Set(report.sources.map((s) => s.postId)),
    };
    const checks = {
      rag: checkCitations(documents.rag, context),
      no_rag: checkCitations(documents.no_rag, context),
    };

    // Sequential, so the first judge call writes the cache before the others read it.
    const input = { week, evidence: report.evidence };
    const rubric = {
      rag: await judgeRubric(caller, input, documents.rag),
      no_rag: await judgeRubric(caller, input, documents.no_rag),
    };
    const pairwise = await judgePairwise(caller, input, documents);

    return {
      report,
      noRag: documents.no_rag,
      checks,
      rubric,
      pairwise,
      calls: caller.calls,
      costUsd: sumCost(caller.calls),
    };
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    console.error(`A/B run for ${week} failed after ${caller.calls.length} call(s)`, error);
    throw new GenerationError('internal', 'Unexpected error; see the server log', caller.calls);
  }
};
