import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { loadConfig } from './config';
import { connect, probe, runMigrations } from './db/client';
import { createApp } from './http/app';

const config = loadConfig(process.env);
const { db } = connect(config.databaseUrl);
await runMigrations(db);

const root = new Hono().route('/', createApp({ probeDatabase: () => probe(db) }));

if (config.webDistDir) {
  const webRoot = config.webDistDir;
  root.use('/*', serveStatic({ root: webRoot }));
  // Single-page app: unknown non-API paths fall back to index.html.
  root.get('*', serveStatic({ root: webRoot, path: 'index.html' }));
}

serve({ fetch: root.fetch, port: config.port }, ({ port }) => {
  console.log(`community-voices api listening on http://localhost:${port}`);
});
