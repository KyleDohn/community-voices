import { PairwiseAnswer, type ReportDocument, RubricScores } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { createCaller } from '../generate/caller';
import { testLlmConfig } from '../generate/testing/llm-config';
import { scriptedLlm, type ScriptedReply } from '../generate/testing/scripted-llm';
import { judgePairwise, judgeRubric } from './judge';

const input = {
  week: '2026-10-26',
  evidence: [
    { postId: 11, topicTitle: 'darktable 5.4 colour shift', text: 'exports look pink' },
    { postId: 12, topicTitle: 'GIMP 3 plugin', text: 'the plugin crashes' },
  ],
};

const docAbout = (title: string): ReportDocument => ({
  themes: [{ title, summary: 's', approxPostCount: 1, citations: [] }],
  notableThreads: [],
  mood: { summary: 'm', citations: [] },
  predictions: [],
});
const rag = docAbout('RAG-THEME');
const noRag = docAbout('NO-RAG-THEME');

const score = (n: number) => ({ score: n, reason: `r${n}` });
const scores: RubricScores = {
  grounding: score(5),
  specificity: score(4),
  coverage: score(3),
  predictionPlausibility: score(2),
  readability: score(1),
};
const answer = (winner: PairwiseAnswer['winner']) => ({
  text: JSON.stringify({ winner, reason: winner }),
});

const judge = (replies: ScriptedReply[]) => {
  const llm = scriptedLlm(replies);
  return {
    caller: createCaller({ llm: llm.client, config: testLlmConfig }),
    requests: llm.requests,
  };
};

const userText = (r: { messages: { content: string }[] }) =>
  r.messages.map((m) => m.content).join();

describe('judgeRubric', () => {
  it('scores one document against the evidence, on a cached system prompt', async () => {
    const { caller, requests } = judge([{ text: JSON.stringify(scores) }]);

    await expect(judgeRubric(caller, input, rag)).resolves.toEqual(scores);

    const [request] = requests;
    expect(request).toMatchObject({ model: 'opus', schema: RubricScores, cacheSystem: true });
    expect(request!.system).toContain('[post 11]');
    expect(request!.system).toContain('exports look pink');
    expect(userText(request!)).toContain('RAG-THEME');
    expect(caller.calls.map((c) => c.step)).toEqual(['judge_rubric']);
  });
});

describe('judgePairwise', () => {
  it('asks twice with the order swapped, and agrees when both passes pick the same variant', async () => {
    // RAG is X first, then Y: "X" then "Y" both mean RAG.
    const { caller, requests } = judge([answer('X'), answer('Y')]);

    const result = await judgePairwise(caller, input, { rag, no_rag: noRag });

    expect(result).toEqual({
      passes: [
        { x: 'rag', winner: 'rag', reason: 'X' },
        { x: 'no_rag', winner: 'rag', reason: 'Y' },
      ],
      winner: 'rag',
    });
    const [first, second] = requests.map(userText);
    expect(first!.indexOf('RAG-THEME')).toBeLessThan(first!.indexOf('NO-RAG-THEME'));
    expect(second!.indexOf('NO-RAG-THEME')).toBeLessThan(second!.indexOf('RAG-THEME'));
    expect(requests.every((r) => r.cacheSystem && r.schema === PairwiseAnswer)).toBe(true);
    expect(caller.calls.map((c) => c.step)).toEqual(['judge_pairwise', 'judge_pairwise']);
  });

  it('calls a verdict that flips with the order a tie', async () => {
    const { caller } = judge([answer('X'), answer('X')]);
    const result = await judgePairwise(caller, input, { rag, no_rag: noRag });
    expect(result.passes.map((p) => p.winner)).toEqual(['rag', 'no_rag']);
    expect(result.winner).toBe('tie');
  });

  it('calls one tie and one win a tie', async () => {
    const { caller } = judge([answer('tie'), answer('Y')]);
    expect((await judgePairwise(caller, input, { rag, no_rag: noRag })).winner).toBe('tie');
  });
});

describe('the judge prompts', () => {
  it('share one system prompt and never name a variant', async () => {
    const { caller, requests } = judge([
      { text: JSON.stringify(scores) },
      answer('X'),
      answer('X'),
    ]);
    await judgeRubric(caller, input, rag);
    await judgePairwise(caller, input, { rag, no_rag: noRag });

    expect(new Set(requests.map((r) => r.system)).size).toBe(1);
    for (const r of requests) {
      const text = (r.system + userText(r)).replace(/(NO-)?RAG-THEME/g, '');
      expect(text).not.toMatch(/\bRAG\b|retriev|no_rag|without/i);
    }
  });
});
