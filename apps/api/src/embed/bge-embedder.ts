import { env, pipeline } from '@huggingface/transformers';
import type { EmbeddingConfig } from '../config';
import type { Embedder } from './embedder';

const DIMENSIONS = 384;

/** Loads bge-small through transformers.js; resolves once the weights are in memory. */
export const loadBgeEmbedder = async (config: EmbeddingConfig): Promise<Embedder> => {
  env.allowRemoteModels = config.allowRemoteModels;
  if (config.cacheDir) env.cacheDir = config.cacheDir;
  const extract = await pipeline('feature-extraction', config.model, { dtype: config.dtype });

  // bge is trained with CLS pooling; normalizing makes cosine similarity a plain dot product.
  const embed = async (texts: string[]) => {
    if (texts.length === 0) return [];
    const output = await extract(texts, { pooling: 'cls', normalize: true });
    return output.tolist() as number[][];
  };

  return {
    model: config.model,
    dimensions: DIMENSIONS,
    embedDocuments: embed,
    embedQuery: async (text) => (await embed([config.queryPrefix + text]))[0]!,
  };
};
