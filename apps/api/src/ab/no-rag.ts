import { ReportDocument } from '@cv/contracts';
import type { Caller } from '../generate/caller';
import { noRagPrompt } from '../generate/prompts';

export { noRagPrompt };

/** Variant A. Schema-checked only: its citations are measured by checkCitations, not rejected. */
export const writeNoRag = (caller: Caller, week: string): Promise<ReportDocument> =>
  caller.run('write_no_rag', noRagPrompt(week), ReportDocument, () => []);
