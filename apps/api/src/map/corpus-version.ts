import { createHash } from 'node:crypto';

/** Identifies what a projection was computed from, so an unchanged corpus is never re-projected. */
export const corpusVersion = (model: string, chunkIds: readonly number[]) =>
  createHash('sha256')
    .update(model)
    .update('\n')
    .update([...chunkIds].sort((a, b) => a - b).join(','))
    .digest('hex');
