import { serve, type ServerType } from '@hono/node-server';

type FetchHandler = (request: Request) => Response | Promise<Response>;

/** Starts the HTTP server; resolves once it listens. */
export const startServer = (
  fetch: FetchHandler,
  port: number,
): Promise<ServerType & { port: number }> =>
  new Promise((resolve) => {
    // Hono's own global Response breaks transformers.js's `instanceof Response`, so a cold model download fails.
    const server = serve({ fetch, port, overrideGlobalObjects: false }, (info) =>
      resolve(Object.assign(server, { port: info.port })),
    );
  });
