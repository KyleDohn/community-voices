import { describe, expect, it } from 'vitest';
import { fakeIngestionJobs } from './testing/fake-ingestion-jobs';

describe('IngestionJobs', () => {
  it('starts a run in the background and reports it when done', async () => {
    const jobs = fakeIngestionJobs();

    const started = await jobs.trigger();
    await started?.done;

    expect((await jobs.get(started!.id))?.status).toBe('succeeded');
  });

  it('refuses a second run while one is in flight, then accepts again', async () => {
    const jobs = fakeIngestionJobs();

    const first = await jobs.trigger();
    expect(await jobs.trigger()).toBeUndefined();
    await first?.done;

    expect(await jobs.trigger()).toBeDefined();
  });
});

describe('IngestionJobs under concurrent requests', () => {
  it('starts only one run when two triggers arrive together', async () => {
    const jobs = fakeIngestionJobs();

    const results = await Promise.all([jobs.trigger(), jobs.trigger()]);

    expect(results.filter(Boolean)).toHaveLength(1);
    await Promise.all(results.map((r) => r?.done));
  });
});

describe('IngestionJobs after a run', () => {
  it('runs the after-run hook before the run counts as done', async () => {
    let hookRuns = 0;
    const jobs = fakeIngestionJobs({ afterRun: async () => void hookRuns++ });

    await (
      await jobs.trigger()
    )?.done;

    expect(hookRuns).toBe(1);
  });

  it('frees the slot before the hook finishes, so a slow embed never blocks the next run', async () => {
    let finishHook!: () => void;
    let hookStarted!: () => void;
    const started = new Promise<void>((resolve) => (hookStarted = resolve));
    const jobs = fakeIngestionJobs({
      afterRun: () => {
        hookStarted();
        return new Promise<void>((resolve) => (finishHook = resolve));
      },
    });

    const first = await jobs.trigger();
    await started;

    expect(await jobs.trigger()).toBeDefined();
    finishHook();
    await first?.done;
  });

  it('still frees the slot when the hook fails', async () => {
    const jobs = fakeIngestionJobs({
      afterRun: async () => {
        throw new Error('embedder failed');
      },
    });

    await (
      await jobs.trigger()
    )?.done;

    expect(await jobs.trigger()).toBeDefined();
  });
});
