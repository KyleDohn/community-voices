/** Downloads the configured embedding model into EMBEDDING_CACHE_DIR; the Docker build runs it. */
import { loadConfig } from '../config';
import { loadBgeEmbedder } from '../embed/bge-embedder';

const config = loadConfig({ ...process.env, EMBEDDING_ALLOW_REMOTE: 'true' });
const embedder = await loadBgeEmbedder(config.embedding);
await embedder.embedQuery('warm-up');
console.log(
  `Fetched ${config.embedding.model} into ${config.embedding.cacheDir ?? 'the default cache'}`,
);
