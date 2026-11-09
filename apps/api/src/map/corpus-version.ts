import { createHash } from 'node:crypto';

export interface EmbeddedChunk {
  id: number;
  embedding: number[];
}

/**
 * Identifies what a projection was computed from, so an unchanged corpus is never re-projected.
 * Vectors are hashed too: an edited post re-embeds its chunks under the same ids.
 */
export const corpusVersion = (model: string, chunks: readonly EmbeddedChunk[]) => {
  const hash = createHash('sha256').update(model);
  for (const chunk of [...chunks].sort((a, b) => a.id - b.id)) {
    hash.update(`\n${chunk.id}:`).update(new Float64Array(chunk.embedding));
  }
  return hash.digest('hex');
};
