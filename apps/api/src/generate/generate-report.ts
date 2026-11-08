import { type LlmCall, ReportDocument, type ReportSource } from '@cv/contracts';
import { z } from 'zod';
import type { LlmConfig, LlmStep } from '../config';
import type { RetrievalLog } from '../retrieve/retrieval-log';
import { type RetrievedChunk, toLogEntries } from '../retrieve/retrieve-week';
import { type ThemeTrend, trendLogEntries } from '../retrieve/trend-lookup';
import { costOf, sumCost } from './cost';
import { type AllowedCitations, validateGrounding } from './grounding';
import { LlmError, type LlmClient, type LlmResponse } from './llm-client';
import { extractPrompt, type Prompt, repairMessage, writePrompt } from './prompts';

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

export type GenerationErrorCode =
  'no_data' | 'invalid_output' | 'refused' | 'cost_cap_exceeded' | 'internal' | LlmError['code'];

/** A run that stopped; `calls` holds what was spent before it did. */
export class GenerationError extends Error {
  constructor(
    readonly code: GenerationErrorCode,
    message: string,
    readonly calls: LlmCall[],
  ) {
    super(message);
    this.name = 'GenerationError';
  }
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

// English runs about 4 characters per token; 3 overestimates, which is the safe side for a cap.
const estimateTokens = ({ system, messages }: Prompt) =>
  Math.ceil((system.length + messages.reduce((n, m) => n + m.content.length, 0)) / 3);

const validate = <T>(
  response: LlmResponse,
  schema: z.ZodType<T>,
  check: (value: T) => string[],
): { value: T } | { errors: string[] } => {
  if (response.stopReason === 'max_tokens') {
    return { errors: ['The output was cut off at the length limit; write it more concisely.'] };
  }
  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch {
    return { errors: ['The output was not valid JSON.'] };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { errors: [z.prettifyError(parsed.error)] };
  const errors = check(parsed.data);
  return errors.length > 0 ? { errors } : { value: parsed.data };
};

/** Makes the run's LLM calls: enforces the cost cap, records each call, allows one repair. */
const createCaller = ({ llm, config }: Pick<GenerateDeps, 'llm' | 'config'>) => {
  const calls: LlmCall[] = [];

  const call = async (step: LlmStep, attempt: number, prompt: Prompt, schema: z.ZodType) => {
    const { model, maxTokens, effort } = config.steps[step];
    const worstCase = costOf(
      { inputTokens: estimateTokens(prompt), outputTokens: maxTokens },
      model,
      config.prices,
    );
    const spent = sumCost(calls);
    if (spent + worstCase > config.maxRunCostUsd) {
      throw new GenerationError(
        'cost_cap_exceeded',
        `Stopped before the ${step} call: $${spent.toFixed(4)} spent, and the call could cost up to ` +
          `$${worstCase.toFixed(4)}, over the $${config.maxRunCostUsd} cap (MAX_RUN_COST_USD).`,
        calls,
      );
    }
    let response: LlmResponse;
    try {
      response = await llm.generate({ ...prompt, model, maxTokens, effort, schema });
    } catch (error) {
      if (error instanceof LlmError) throw new GenerationError(error.code, error.message, calls);
      throw error;
    }
    const { usage } = response;
    // A dated snapshot id isn't in the price table; its alias's price beats losing a paid call.
    const priced = response.model in config.prices ? response.model : model;
    calls.push({
      step,
      attempt,
      model: response.model,
      ...usage,
      costUsd: costOf(usage, priced, config.prices),
    });
    if (response.stopReason === 'refusal') {
      throw new GenerationError('refused', `The model declined the ${step} request.`, calls);
    }
    return response;
  };

  /** One call, and exactly one repair if its output fails the schema or the check. */
  const run = async <T>(
    step: LlmStep,
    prompt: Prompt,
    schema: z.ZodType<T>,
    check: (value: T) => string[],
  ) => {
    const first = await call(step, 1, prompt, schema);
    const firstResult = validate(first, schema, check);
    if ('value' in firstResult) return firstResult.value;

    const repair: Prompt = {
      system: prompt.system,
      messages: [
        ...prompt.messages,
        // The API rejects an empty assistant turn; a reply can be all thinking, cut off at the cap.
        { role: 'assistant', content: first.text || '(no output)' },
        repairMessage(firstResult.errors),
      ],
    };
    const second = validate(await call(step, 2, repair, schema), schema, check);
    if ('value' in second) return second.value;
    throw new GenerationError(
      'invalid_output',
      `The ${step} output was still invalid after one repair: ${second.errors.join('; ')}`,
      calls,
    );
  };

  return { run, calls };
};

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

/** The RAG report: retrieve, extract themes, trend lookup, write, validate. */
export const generateReport = async (
  deps: GenerateDeps,
  week: string,
): Promise<GeneratedReport> => {
  const chunks = await deps.retrieval.retrieve(week);
  if (chunks.length === 0) {
    throw new GenerationError('no_data', `No embedded posts in the week of ${week}`, []);
  }
  const caller = createCaller(deps);
  try {
    return await writeReport(deps, week, chunks, caller);
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
  caller: ReturnType<typeof createCaller>,
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

  return {
    retrievalRunId,
    themes,
    document,
    sources,
    calls: caller.calls,
    costUsd: sumCost(caller.calls),
  };
};
