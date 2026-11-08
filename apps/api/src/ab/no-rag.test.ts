import { ReportDocument } from '@cv/contracts';
import { describe, expect, it } from 'vitest';
import { createCaller } from '../generate/caller';
import { testLlmConfig } from '../generate/testing/llm-config';
import { scriptedLlm } from '../generate/testing/scripted-llm';
import { noRagPrompt, writeNoRag } from './no-rag';

const week = '2026-10-26';
const document: ReportDocument = {
  themes: [{ title: 't', summary: 'Insufficient evidence', approxPostCount: 0, citations: [] }],
  notableThreads: [],
  mood: { summary: 'Insufficient evidence', citations: [] },
  predictions: [],
};

describe('noRagPrompt', () => {
  it('names the forum and the date range, and holds no posts', () => {
    const { system, messages } = noRagPrompt(week);
    const text = system + messages.map((m) => m.content).join('\n');

    expect(text).toContain('discuss.pixls.us');
    expect(text).toContain('2026-10-26');
    expect(text).toContain('2026-11-01');
    expect(text).not.toContain('[post');
    expect(text).not.toMatch(/trend/i);
  });

  it('says it has no posts and asks for the report from its own knowledge, not an abstention', () => {
    const { system } = noRagPrompt(week);
    expect(system).toMatch(/no access to the posts/i);
    expect(system).toMatch(/what you know/i);
    expect(system).not.toMatch(/supplied posts|posts in the user message/i);
  });
});

describe('writeNoRag', () => {
  it('writes the document as its own step with the report schema', async () => {
    const llm = scriptedLlm([{ text: JSON.stringify(document) }]);
    const caller = createCaller({ llm: llm.client, config: testLlmConfig });

    await expect(writeNoRag(caller, week)).resolves.toEqual(document);

    expect(llm.requests[0]).toMatchObject({ model: 'sonnet', schema: ReportDocument });
    expect(caller.calls.map((c) => c.step)).toEqual(['write_no_rag']);
  });
});
