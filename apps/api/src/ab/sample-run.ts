import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AbRunResponse } from '@cv/contracts';
import { z } from 'zod';
import type { Database } from '../db/client';
import { abRuns, reports } from '../db/schema';
import { SEED_DIR } from '../seed/seed';

/** One real run, committed so a reviewer sees a full result with no API key (ASSUMPTIONS #12). */
export const SAMPLE_FILE = join(SEED_DIR, 'ab-run-sample.json');

const SampleFile = z.object({ note: z.string(), abRun: AbRunResponse });

export const exportSample = (abRun: AbRunResponse, note: string) => ({ note, abRun });

const date = (iso: string | null) => (iso ? new Date(iso) : null);

/** Boot-time: a database with no A/B runs gets the sample, marked so the UI never shows it as live. */
export const loadSampleIfEmpty = async (db: Database, file = SAMPLE_FILE) => {
  const text = await readFile(file, 'utf8').catch(() => undefined);
  if (text === undefined) return 'missing' as const;
  const parsed = SampleFile.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Invalid sample A/B run: ${z.prettifyError(parsed.error)}`);
  const { ragReport: report, ...run } = parsed.data.abRun;

  return db.transaction(async (tx) => {
    if ((await tx.select({ id: abRuns.id }).from(abRuns).limit(1)).length > 0) {
      return 'skipped' as const;
    }
    if (report) {
      await tx.insert(reports).values({
        ...report,
        // The seed has no retrieval runs; the report keeps its sources, which carry the posts.
        retrievalRunId: null,
        isSample: true,
        createdAt: new Date(report.createdAt),
        finishedAt: date(report.finishedAt),
        errorCode: report.error?.code,
        errorMessage: report.error?.message,
      });
    }
    await tx.insert(abRuns).values({
      ...run,
      isSample: true,
      reportId: report?.id ?? null,
      createdAt: new Date(run.createdAt),
      finishedAt: date(run.finishedAt),
      errorCode: run.error?.code,
      errorMessage: run.error?.message,
    });
    return 'loaded' as const;
  });
};
