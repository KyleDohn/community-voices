import { readFileSync } from 'node:fs';
import site from './__fixtures__/site.json' with { type: 'json' };
import latest0 from './__fixtures__/latest-page-0.json' with { type: 'json' };
import latest1 from './__fixtures__/latest-page-1.json' with { type: 'json' };
import topic60539 from './__fixtures__/topic-60539.json' with { type: 'json' };
import topic60539Posts from './__fixtures__/topic-60539-posts.json' with { type: 'json' };
import topic62066 from './__fixtures__/topic-62066.json' with { type: 'json' };

const robots = readFileSync(new URL('./__fixtures__/robots.txt', import.meta.url), 'utf8');

/** Serves recorded pixls fixtures by URL and records every request, so tests can assert on traffic. */
export const createFakeDiscourse = (overrides: Record<string, unknown> = {}) => {
  const requests: string[] = [];
  const allPosts = [...topic60539.post_stream.posts, ...topic60539Posts.post_stream.posts];

  const route = (url: URL): unknown => {
    const key =
      url.pathname + (url.searchParams.has('page') ? `?page=${url.searchParams.get('page')}` : '');
    if (key in overrides) return overrides[key];
    if (key === '/site.json') return site;
    if (key === '/latest.json?page=0' || key === '/latest.json') return latest0;
    if (key === '/latest.json?page=1') return latest1;
    if (key === '/t/60539.json') return topic60539;
    if (key === '/t/62066.json') return topic62066;
    if (key === '/t/60539/posts.json') {
      const ids = new Set(url.searchParams.getAll('post_ids[]').map(Number));
      return { post_stream: { posts: allPosts.filter((p) => ids.has(p.id)) } };
    }
    return undefined;
  };

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push(url.pathname + url.search);
    const userAgent = new Headers(init?.headers).get('User-Agent');
    if (!userAgent) return new Response('missing user agent', { status: 403 });
    if (url.pathname === '/robots.txt') {
      const text = overrides['/robots.txt'] === undefined ? robots : overrides['/robots.txt'];
      return text === null
        ? new Response('not found', { status: 404 })
        : new Response(String(text));
    }
    const body = route(url);
    return body === undefined ? new Response('not found', { status: 404 }) : Response.json(body);
  };

  return { fetch: fetch as typeof globalThis.fetch, requests };
};
