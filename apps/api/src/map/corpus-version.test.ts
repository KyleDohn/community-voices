import { describe, expect, it } from 'vitest';
import { corpusVersion } from './corpus-version';

const model = 'Xenova/bge-small-en-v1.5';

describe('corpusVersion', () => {
  it('ignores the order of the chunk ids', () => {
    expect(corpusVersion(model, [3, 1, 2])).toBe(corpusVersion(model, [1, 2, 3]));
  });

  it('changes when a chunk is added or removed', () => {
    expect(corpusVersion(model, [1, 2, 3, 4])).not.toBe(corpusVersion(model, [1, 2, 3]));
    expect(corpusVersion(model, [1, 2])).not.toBe(corpusVersion(model, [1, 2, 3]));
  });

  it('changes with the embedding model', () => {
    expect(corpusVersion('other-model', [1, 2, 3])).not.toBe(corpusVersion(model, [1, 2, 3]));
  });

  it('does not confuse ids that concatenate alike', () => {
    expect(corpusVersion(model, [1, 23])).not.toBe(corpusVersion(model, [1, 2, 3]));
  });
});
