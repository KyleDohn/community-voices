import { describe, expect, it } from 'vitest';
import { corpusVersion } from './corpus-version';

const model = 'Xenova/bge-small-en-v1.5';
/** Chunks with the given ids, all sharing one vector, so only the ids differ. */
const chunks = (...ids: number[]) => ids.map((id) => ({ id, embedding: [0.5, -0.25] }));

describe('corpusVersion', () => {
  it('ignores the order of the chunks', () => {
    expect(corpusVersion(model, chunks(3, 1, 2))).toBe(corpusVersion(model, chunks(1, 2, 3)));
  });

  it('changes when a chunk is added or removed', () => {
    expect(corpusVersion(model, chunks(1, 2, 3, 4))).not.toBe(
      corpusVersion(model, chunks(1, 2, 3)),
    );
    expect(corpusVersion(model, chunks(1, 2))).not.toBe(corpusVersion(model, chunks(1, 2, 3)));
  });

  it('changes with the embedding model', () => {
    expect(corpusVersion('other-model', chunks(1, 2, 3))).not.toBe(
      corpusVersion(model, chunks(1, 2, 3)),
    );
  });

  it('changes when an edited post re-embeds a chunk under the same id', () => {
    const edited = [{ id: 1, embedding: [0.5, -0.2] }, ...chunks(2, 3)];
    expect(corpusVersion(model, edited)).not.toBe(corpusVersion(model, chunks(1, 2, 3)));
  });

  it('does not confuse ids that concatenate alike', () => {
    expect(corpusVersion(model, chunks(1, 23))).not.toBe(corpusVersion(model, chunks(1, 2, 3)));
  });
});
