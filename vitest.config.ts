import { defineConfig } from 'vitest/config';

/** Unit tests: fast, no I/O. Run on every commit. */
export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.{ts,tsx}'],
    exclude: ['**/*.int.test.ts', '**/*.model.test.ts', '**/node_modules/**'],
  },
});
