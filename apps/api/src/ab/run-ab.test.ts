import type { ReportDocument } from '@cv/contracts';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Caller } from '../generate/caller';
import type { GeneratedReport } from '../generate/generate-report';
import { LlmError } from '../generate/llm-client';
import { testLlmConfig } from '../generate/testing/llm-config';
import { scriptedLlm, type ScriptedReply } from '../generate/testing/scripted-llm';
import { runAb } from './run-ab';

const week = '2026-10-26';

const doc = (title: string, citations: number[]): ReportDocument => ({
  themes: [{ title, summary: 's', approxPostCount: 1, citations }],
  notableThreads: [],
  mood: { summary: 'm', citations: [] },
  predictions: [],
});
const ragDoc = doc('THEME-ONE', [1]);
const noRagDoc = doc('THEME-TWO', [999]);

/** Stands in for generateReport: one paid call through the run's caller. */
const fakeReport = async (_week: string, caller: Caller): Promise<GeneratedReport> => {
  await caller.run('write', { system: 's', messages: [] }, z.unknown(), () => []);
  return {
    retrievalRunId: 'run-1',
    themes: ['THEME-ONE'],
    document: ragDoc,
    sources: [{ postId: 1, url: 'u', topicTitle: 'T', weekStart: week }],
    evidence: [{ postId: 1, topicTitle: 'T', text: 'EVIDENCE-TEXT' }],
    calls: caller.calls.slice(),
    costUsd: 0,
  };
};

const score = { score: 3, reason: 'r' };
const rubric = {
  grounding: score,
  specificity: score,
  coverage: score,
  predictionPlausibility: score,
  readability: score,
};
const judged: ScriptedReply[] = [
  { text: JSON.stringify(ragDoc) },
  { text: JSON.stringify(noRagDoc) },
  { text: JSON.stringify(rubric) },
  { text: JSON.stringify(rubric) },
  { text: JSON.stringify({ winner: 'X', reason: 'a' }) },
  { text: JSON.stringify({ winner: 'Y', reason: 'b' }) },
];

const setup = (replies: ScriptedReply[], overrides: Partial<typeof testLlmConfig> = {}) => {
  const llm = scriptedLlm(replies);
  const postWeeks = vi.fn(
    async (ids: number[]) => new Map(ids.filter((id) => id < 100).map((id) => [id, week])),
  );
  const deps = {
    llm: llm.client,
    config: { ...testLlmConfig, ...overrides },
    generateReport: fakeReport,
    corpus: { postWeeks },
  };
  return { deps, requests: llm.requests, postWeeks };
};

describe('runAb', () => {
  it('writes both variants, checks them, then judges them blind', async () => {
    const { deps, requests, postWeeks } = setup(judged);
    const onReport = vi.fn(async () => {
      expect(requests).toHaveLength(1);
    });

    const result = await runAb(deps, week, { onReport });

    expect(onReport).toHaveBeenCalledOnce();
    expect(result.report.document).toEqual(ragDoc);
    expect(result.noRag).toEqual(noRagDoc);
    expect(result.calls.map((c) => c.step)).toEqual([
      'write',
      'write_no_rag',
      'judge_rubric',
      'judge_rubric',
      'judge_pairwise',
      'judge_pairwise',
    ]);
    expect(result.costUsd).toBeCloseTo(
      result.calls.reduce((sum, c) => sum + c.costUsd, 0),
      10,
    );
    // The first rubric call scores the RAG document, the second the no-RAG one.
    expect(requests[2]!.messages[0]!.content).toContain('THEME-ONE');
    expect(requests[2]!.messages[0]!.content).not.toContain('THEME-TWO');
    expect(requests[3]!.messages[0]!.content).toContain('THEME-TWO');
    expect(requests[3]!.messages[0]!.content).not.toContain('THEME-ONE');
    expect(requests[2]!.system).toContain('EVIDENCE-TEXT');
    expect(postWeeks).toHaveBeenCalledWith([1, 999]);
    expect(result.checks.rag).toMatchObject({ notInCorpus: [], notRetrieved: [] });
    expect(result.checks.no_rag).toMatchObject({ notInCorpus: [999] });
    expect(result.rubric).toEqual({ rag: rubric, no_rag: rubric });
    expect(result.pairwise.winner).toBe('rag');
  });

  it('holds every call to the A/B cap and names it when it stops', async () => {
    // Each sonnet call costs $0.007 and has a worst case near $0.041, so both writes fit $0.05;
    // the first opus judge call ($0.014 spent + a worst case near $0.043) does not.
    const { deps } = setup(judged, { maxAbRunCostUsd: 0.05 });

    const error = await runAb(deps, week).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'cost_cap_exceeded' });
    expect(String(error)).toMatch(/MAX_AB_RUN_COST_USD/);
    expect((error as { calls: unknown[] }).calls).toHaveLength(2);
  });

  it('stops on a judge failure with every call made so far, after storing the report', async () => {
    const { deps } = setup([...judged.slice(0, 3), new LlmError('spend_limit_reached', 'limit')]);
    const onReport = vi.fn(async () => {});

    const error = await runAb(deps, week, { onReport }).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'spend_limit_reached' });
    expect((error as { calls: { step: string }[] }).calls.map((c) => c.step)).toEqual([
      'write',
      'write_no_rag',
      'judge_rubric',
    ]);
    expect(onReport).toHaveBeenCalledOnce();
  });

  it('turns an unexpected error into an internal failure that keeps the calls', async () => {
    const { deps, postWeeks } = setup(judged);
    postWeeks.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const error = await runAb(deps, week).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'internal' });
    expect((error as { calls: unknown[] }).calls).toHaveLength(2);
  });
});
