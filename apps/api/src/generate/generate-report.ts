import { type LlmCall, ReportDocument, type ReportSource } from '@cv/contracts';
import { z } from 'zod';
import type { LlmConfig } from '../config';
import type { RetrievalLog } from '../retrieve/retrieval-log';
import { type RetrievedChunk, toLogEntries } from '../retrieve/retrieve-week';
import { type ThemeTrend, trendLogEntries } from '../retrieve/trend-lookup';
import { type Caller, createCaller, GenerationError } from './caller';
import { sumCost } from './cost';
import { type AllowedCitations, validateGrounding } from './grounding';
import type { LlmClient } from './llm-client';
import { extractPrompt, writePrompt } from './prompts';

export { GenerationError, type GenerationErrorCode } from './caller';

/** Retrieval as the generator needs it; the app binds retrieveWeek and trendLookup. */
export interface Retrieval {
  retrieve(week: string): Promise<RetrievedChunk[]>;
  /** Each theme over the target week and the prior weeks, target week first. */
  trends(week: string, themes: string[]): Promise<ThemeTrend[]>;
  /** Nearest chunks pooled per theme; the writer prompt explains the counts with it. */
  readonly poolSize: number;
}

export interface GenerateDeps {
  retrieval: Retrieval;
  log: RetrievalLog;
  llm: LlmClient;
  config: LlmConfig;
}

export interface GeneratedReport {
  retrievalRunId: string;
  themes: string[];
  document: ReportDocument;
  sources: ReportSource[];
  calls: LlmCall[];
  costUsd: number;
}

const MAX_THEMES = 6;

const ExtractedThemes = z.object({ themes: z.array(z.string()).min(1) });

/** Every post the writer saw, once each: the facet picks, then the trend examples. */
const sourcesOf = (
  week: string,
  chunks: RetrievedChunk[],
  trends: ThemeTrend[],
): ReportSource[] => {
  const all = [
    ...chunks.map((c) => ({ ...c, weekStart: week })),
    ...trends.flatMap((t) =>
      t.weeks.flatMap((w) => w.examples.map((e) => ({ ...e, weekStart: w.weekStart }))),
    ),
  ];
  // A post belongs to one week, so duplicates are identical; a Map keeps the first position.
  const byPost = new Map(
    all.map(({ postId, url, topicTitle, weekStart }) => [
      postId,
      { postId, url, topicTitle, weekStart },
    ]),
  );
  return [...byPost.values()];
};

const allowedFrom = (week: string, sources: ReportSource[]): AllowedCitations => ({
  targetWeek: new Set(sources.filter((s) => s.weekStart === week).map((s) => s.postId)),
  priorWeeks: new Set(sources.filter((s) => s.weekStart !== week).map((s) => s.postId)),
});

/**
 * The RAG report: retrieve, extract themes, trend lookup, write, validate. An A/B run passes its own
 * caller so the report's calls count toward the A/B cap; `calls` holds only this report's calls.
 */
export const generateReport = async (
  deps: GenerateDeps,
  week: string,
  caller: Caller = createCaller(deps),
): Promise<GeneratedReport> => {
  const chunks = await deps.retrieval.retrieve(week);
  if (chunks.length === 0) {
    throw new GenerationError('no_data', `No embedded posts in the week of ${week}`, []);
  }
  const firstCall = caller.calls.length;
  try {
    return await writeReport(deps, week, chunks, caller, firstCall);
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    // Anything else after the first call must still report what was paid for; details stay in the log.
    console.error(`Report for ${week} failed after ${caller.calls.length} call(s)`, error);
    throw new GenerationError('internal', 'Unexpected error; see the server log', caller.calls);
  }
};

const writeReport = async (
  deps: GenerateDeps,
  week: string,
  chunks: RetrievedChunk[],
  caller: Caller,
  firstCall: number,
): Promise<GeneratedReport> => {
  const extracted = await caller.run(
    'extract',
    extractPrompt(week, chunks),
    ExtractedThemes,
    () => [],
  );
  const themes = extracted.themes.slice(0, MAX_THEMES);
  const trends = await deps.retrieval.trends(week, themes);
  const retrievalRunId = await deps.log.record(week, [
    ...toLogEntries(chunks),
    ...trendLogEntries(trends),
  ]);

  const sources = sourcesOf(week, chunks, trends);
  const allowed = allowedFrom(week, sources);
  const prompt = writePrompt(week, chunks, trends, deps.retrieval.poolSize);
  const document = await caller.run('write', prompt, ReportDocument, (doc) =>
    validateGrounding(doc, allowed),
  );

  const calls = caller.calls.slice(firstCall);
  return {
    retrievalRunId,
    themes,
    document,
    sources,
    calls,
    costUsd: sumCost(calls),
  };
};
