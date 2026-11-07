import { describeEmbedderContract } from './embedder-contract';
import { fakeEmbedder } from './fake-embedder';

describeEmbedderContract('fakeEmbedder', async () => fakeEmbedder());
