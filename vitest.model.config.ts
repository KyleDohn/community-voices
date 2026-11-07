import { defineConfig } from 'vitest/config';

/** Real-model tests: load the bge weights (downloaded on first run), so they are opt-in. */
export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.model.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
