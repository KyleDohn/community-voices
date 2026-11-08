import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// The repo's .env, as the app sees it; the Anthropic test skips without a key. Node's parser, so the
// root package needs no vite dependency of its own.
const dotenv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};

/** Real-model tests: bge weights (downloaded on first run) and paid API calls, so they are opt-in. */
export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.model.test.ts'],
    env: dotenv,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
