import { ReportDocument } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { LlmConfig } from '../config';
import type { RetrievalEntry } from '../retrieve/retrieval-log';
import type { RetrievedChunk } from '../retrieve/retrieve-week';
import type { ThemeTrend } from '../retrieve/trend-lookup';
import { createCaller } from './caller';
import { generateReport, type Retrieval } from './generate-report';
import { LlmError } from './llm-client';
import { scriptedLlm, type ScriptedReply } from './testing/scripted-llm';

const week = '2026-10-26';

const config: LlmConfig = {
  steps: {
    extract: { model: 'haiku', maxTokens: 300, effort: 'low' },
    write: { model: 'sonnet', maxTokens: 4_000, effort: 'medium' },
  },
  maxRunCostUsd: 0.5,
  prices: {
    haiku: { inputPerMillion: 1, outputPerMillion: 5 },
    sonnet: { inputPerMillion: 2, outputPerMillion: 10 },
  },
};

const hit = (postId: number) => ({
  chunkId: postId * 10,
  postId,
  topicId: postId,
  topicTitle: `Topic ${postId}`,
  url: `https://forum.test/p/${postId}`,
  text: `text of post ${postId}`,
});

const chunks: RetrievedChunk[] = [
  { ...hit(11), facets: [{ facetId: 'releases', rank: 1, score: 0.9 }] },
  { ...hit(12), facets: [{ facetId: 'help', rank: 1, score: 0.8 }] },
];

const theme = 'Colour shifts after the 5.4 upgrade';

// Post 13 is a target-week trend example outside the facet picks; 50 is from the week before.
const trendFor = (t: string): ThemeTrend => ({
  theme: t,
  weeks: [
    { weekStart: week, matches: 9, examples: [{ ...hit(13), score: 0.7 }] },
    { weekStart: '2026-10-19', matches: 3, examples: [{ ...hit(50), score: 0.6 }] },
  ],
});

const retrieval: Retrieval = {
  retrieve: async () => chunks,
  trends: async (_week, themes) => themes.map(trendFor),
  poolSize: 40,
};

const memoryLog = () => {
  const recorded: { week: string; entries: RetrievalEntry[] }[] = [];
  return {
    recorded,
    record: async (w: string, entries: RetrievalEntry[]) => {
      recorded.push({ week: w, entries });
      return 'run-1';
    },
    entriesFor: async () => [],
  };
};

const document: ReportDocument = {
  themes: [{ title: theme, summary: 's', approxPostCount: 9, citations: [11, 13] }],
  notableThreads: [{ title: 'Topic 12', why: 'w', citations: [12] }],
  mood: { summary: 'm', citations: [] },
  predictions: [{ claim: 'c', rationale: 'r', confidence: 'low', citations: [11, 50] }],
};

const extracted = { text: JSON.stringify({ themes: [theme] }) };
const written = { text: JSON.stringify(document) };

const run = (replies: ScriptedReply[], overrides: Partial<LlmConfig> = {}) => {
  const llm = scriptedLlm(replies);
  const log = memoryLog();
  const result = generateReport(
    { retrieval, log, llm: llm.client, config: { ...config, ...overrides } },
    week,
  );
  return { result, requests: llm.requests, log };
};

describe('generateReport', () => {
  it('extracts themes, looks up their trends, then writes a document grounded in both', async () => {
    const { result, requests, log } = run([extracted, written]);
    const report = await result;

    expect(report.document).toEqual(document);
    expect(report.themes).toEqual([theme]);
    expect(requests.map((r) => [r.model, r.maxTokens, r.effort])).toEqual([
      ['haiku', 300, 'low'],
      ['sonnet', 4_000, 'medium'],
    ]);
    expect(requests[1]!.schema).toBe(ReportDocument);
    const extractPrompt = requests[0]!.messages[0]!.content;
    expect(extractPrompt).toContain('[post 11]');
    expect(extractPrompt).toContain('[post 12]');
    const writePrompt = requests[1]!.messages[0]!.content;
    for (const label of ['[post 11]', '[post 12]', '[post 13]', '[post 50]', theme]) {
      expect(writePrompt).toContain(label);
    }

    expect(report.sources).toEqual([
      { postId: 11, url: hit(11).url, topicTitle: 'Topic 11', weekStart: week },
      { postId: 12, url: hit(12).url, topicTitle: 'Topic 12', weekStart: week },
      { postId: 13, url: hit(13).url, topicTitle: 'Topic 13', weekStart: week },
      { postId: 50, url: hit(50).url, topicTitle: 'Topic 50', weekStart: '2026-10-19' },
    ]);
    expect(report.retrievalRunId).toBe('run-1');
    expect(log.recorded[0]!.entries.map((e) => [e.postId, e.query])).toEqual([
      [11, 'releases'],
      [12, 'help'],
      [13, theme],
      [50, theme],
    ]);
  });

  it('prices each call with the model that answered and sums the run', async () => {
    // The fake reports 1,000 in and 500 out per call.
    const report = await run([extracted, written]).result;
    // haiku: 1000 x $1/M + 500 x $5/M = $0.0035; sonnet: 1000 x $2/M + 500 x $10/M = $0.007.
    expect(report.calls).toEqual([
      expect.objectContaining({
        step: 'extract',
        attempt: 1,
        model: 'haiku',
        costUsd: expect.closeTo(0.0035, 10),
      }),
      expect.objectContaining({
        step: 'write',
        attempt: 1,
        model: 'sonnet',
        costUsd: expect.closeTo(0.007, 10),
      }),
    ]);
    expect(report.costUsd).toBeCloseTo(0.0105, 10);
  });

  describe('repair', () => {
    const ungrounded = {
      text: JSON.stringify({ ...document, mood: { summary: 'm', citations: [999] } }),
    };

    it('sends the validation errors back once, and accepts a fixed reply', async () => {
      const { result, requests } = run([extracted, ungrounded, written]);
      const report = await result;

      expect(report.document).toEqual(document);
      const repair = requests[2]!;
      expect(repair.maxTokens).toBe(4_000);
      expect(repair.messages.at(-2)).toEqual({ role: 'assistant', content: ungrounded.text });
      expect(repair.messages.at(-1)!.content).toContain('mood.citations: post 999');
      expect(report.calls.map((c) => [c.step, c.attempt])).toEqual([
        ['extract', 1],
        ['write', 1],
        ['write', 2],
      ]);
    });

    it('fails cleanly after a second invalid reply, without a third call', async () => {
      const { result, requests } = run([extracted, { text: 'not json' }, ungrounded, written]);

      await expect(result).rejects.toMatchObject({
        code: 'invalid_output',
        message: expect.stringContaining('post 999'),
        calls: [expect.anything(), expect.anything(), expect.anything()],
      });
      expect(requests).toHaveLength(3);
    });

    it('treats a reply cut off at max_tokens as invalid', async () => {
      const { result, requests } = run([
        extracted,
        { ...written, stopReason: 'max_tokens' },
        written,
      ]);
      await result;
      expect(requests[2]!.messages.at(-1)!.content).toMatch(/cut off/);
    });

    it('repairs theme extraction the same way', async () => {
      const { result, requests } = run([{ text: '{"themes": []}' }, extracted, written]);
      expect((await result).themes).toEqual([theme]);
      expect(requests[1]!.model).toBe('haiku');
    });
  });

  it('repairs a theme that cites a prior-week trend example', async () => {
    const priorInTheme = {
      text: JSON.stringify({ ...document, themes: [{ ...document.themes[0], citations: [50] }] }),
    };
    const { result, requests } = run([extracted, priorInTheme, written]);
    await result;
    expect(requests[2]!.messages.at(-1)!.content).toContain('themes[0].citations: post 50');
  });

  it('looks up trends for at most six themes', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => `theme ${i}`);
    const seen: string[][] = [];
    const llm = scriptedLlm([{ text: JSON.stringify({ themes: eight }) }, written]);
    const spy = {
      ...retrieval,
      trends: async (w: string, t: string[]) => (seen.push(t), retrieval.trends(w, t)),
    };
    await generateReport({ retrieval: spy, log: memoryLog(), llm: llm.client, config }, week);
    expect(seen).toEqual([eight.slice(0, 6)]);
  });

  it('keeps the paid calls when something else fails after them', async () => {
    const llm = scriptedLlm([extracted, written]);
    const broken = { ...retrieval, trends: () => Promise.reject(new Error('db down')) };
    const result = generateReport(
      { retrieval: broken, log: memoryLog(), llm: llm.client, config },
      week,
    );

    await expect(result).rejects.toMatchObject({
      code: 'internal',
      calls: [expect.objectContaining({ step: 'extract' })],
    });
  });

  it('prices a reply from an unlisted model id at the configured model, rather than failing', async () => {
    const report = await run([extracted, { ...written, model: 'sonnet-20261101' }]).result;
    expect(report.calls[1]).toMatchObject({
      model: 'sonnet-20261101',
      costUsd: expect.closeTo(0.007, 10),
    });
  });

  it('never sends an empty assistant turn in a repair', async () => {
    // The cap covers thinking, so a reply can stop at max_tokens with no text at all.
    const { result, requests } = run([extracted, { text: '', stopReason: 'max_tokens' }, written]);
    await result;
    expect(requests[2]!.messages.at(-2)!.content).not.toBe('');
  });

  it('stops on a refusal without trying a repair', async () => {
    const { result, requests } = run([extracted, { text: '', stopReason: 'refusal' }, written]);
    await expect(result).rejects.toMatchObject({ code: 'refused' });
    expect(requests).toHaveLength(2);
  });

  it('stops on a spend limit with no repair or further call', async () => {
    const limit = new LlmError(
      'spend_limit_reached',
      'API spend limit reached; raise it in the Console',
    );
    const { result, requests } = run([extracted, limit, written]);
    await expect(result).rejects.toMatchObject({
      code: 'spend_limit_reached',
      calls: [expect.objectContaining({ step: 'extract' })],
    });
    expect(requests).toHaveLength(2);
  });

  it('stops before a call whose worst case would cross the cost cap', async () => {
    // Extract spends $0.0035. The write's worst case is at least 4,000 x $10/M = $0.04.
    const { result, requests } = run([extracted, written], { maxRunCostUsd: 0.04 });

    await expect(result).rejects.toMatchObject({
      code: 'cost_cap_exceeded',
      message: expect.stringContaining('$0.0035 spent'),
      calls: [expect.objectContaining({ step: 'extract' })],
    });
    expect(requests).toHaveLength(1);
  });

  it('counts the input estimate toward the worst case, not only max_tokens', async () => {
    // $0.0035 spent + $0.04 output = $0.0435, under the cap; the prompt's input must push it over.
    const { result } = run([extracted, written], { maxRunCostUsd: 0.0436 });
    await expect(result).rejects.toMatchObject({ code: 'cost_cap_exceeded' });
  });

  it('fails with no_data, and makes no call, for a week with no embedded posts', async () => {
    const llm = scriptedLlm([]);
    const empty = { ...retrieval, retrieve: async () => [] };
    const result = generateReport(
      { retrieval: empty, log: memoryLog(), llm: llm.client, config },
      week,
    );
    await expect(result).rejects.toMatchObject({ code: 'no_data' });
  });

  it('on a shared caller, returns only its own calls but counts earlier ones toward the cap', async () => {
    const llm = scriptedLlm([{ text: '{}' }, extracted, written]);
    const deps = { retrieval, log: memoryLog(), llm: llm.client, config };
    const caller = createCaller(deps);
    await caller.run('extract', { system: 's', messages: [] }, z.object({}), () => []);

    const report = await generateReport(deps, week, caller);

    expect(report.calls.map((c) => c.step)).toEqual(['extract', 'write']);
    expect(report.costUsd).toBeCloseTo(report.calls[0]!.costUsd + report.calls[1]!.costUsd, 9);
    expect(caller.calls).toHaveLength(3);
  });
});
