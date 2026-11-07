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
