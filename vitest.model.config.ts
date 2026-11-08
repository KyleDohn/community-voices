import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/** Real-model tests: bge weights (downloaded on first run) and paid API calls, so they are opt-in. */
export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.model.test.ts'],
    // The repo's .env, as the app sees it; the Anthropic test skips without a key.
    env: loadEnv('', process.cwd(), ''),
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
