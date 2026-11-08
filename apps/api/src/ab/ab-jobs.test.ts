import type { LlmCall } from '@cv/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryReportRepository } from '../generate/testing/memory-report-repository';
import { createAbJobs } from './ab-jobs';
import type { AbResult } from './run-ab';
import { createMemoryAbRunRepository } from './testing/memory-ab-run-repository';

const call: LlmCall = {
  step: 'judge_pairwise',
  attempt: 1,
  model: 'm',
  inputTokens: 1,
  outputTokens: 1,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0.1,
};

describe('A/B jobs', () => {
  it('keeps the calls paid for when storing the finished run fails', async () => {
    const repo = createMemoryAbRunRepository();
    repo.succeed = async () => {
      throw new Error('jsonb rejected the reason');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const jobs = createAbJobs({
      repo,
      reports: createMemoryReportRepository(),
      run: async () => ({ calls: [call, call] }) as AbResult,
      canGenerate: true,
    });

    const { id } = (await jobs.trigger('2026-10-26'))!;
    await jobs.settled();

    expect(await jobs.get(id)).toMatchObject({
      status: 'failed',
      error: { code: 'internal' },
      calls: [call, call],
      costUsd: expect.closeTo(0.2, 10),
    });
  });
});
