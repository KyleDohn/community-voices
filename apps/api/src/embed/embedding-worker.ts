import type { EmbedderStatus } from '@cv/contracts';
import { embedPendingChunks } from './embed-pending';
import type { Embedder } from './embedder';
import type { EmbeddingStore } from './embedding-store';

/** Loads the model in the background and runs embedding passes one at a time. */
export const createEmbeddingWorker = (
  load: () => Promise<Embedder>,
  store: EmbeddingStore,
  { batchSize }: { batchSize: number },
) => {
  let status: EmbedderStatus = 'loading';
  const embedder = load().then(
    (loaded) => ((status = 'ready'), loaded),
    (error: unknown) => {
      status = 'failed';
      throw error;
    },
  );
  // Failure is reported through status(); without this a load error with no pass waiting crashes Node.
  embedder.catch(() => undefined);
  // Passes queue behind each other, so two triggers never embed the same batch twice.
  let queue: Promise<unknown> = Promise.resolve();

  const embedPending = () => {
    const pass = queue.then(async () => embedPendingChunks(store, await embedder, { batchSize }));
    queue = pass.catch(() => undefined);
    return pass;
  };

  return { status: () => status, embedder, embedPending };
};

export type EmbeddingWorker = ReturnType<typeof createEmbeddingWorker>;
