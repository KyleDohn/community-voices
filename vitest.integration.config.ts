import { defineConfig } from 'vitest/config';

/** Integration tests: need the `db-test` compose service (`pnpm db:test:up`). */
export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.int.test.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://cv:cv@localhost:5434/community_voices_test',
    },
  },
});
