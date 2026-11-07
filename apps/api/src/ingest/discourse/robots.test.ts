import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAllowed } from './robots';

const pixls = readFileSync(new URL('./__fixtures__/robots.txt', import.meta.url), 'utf8');
const agent = 'community-voices/0.1 (demo)';

describe('isAllowed', () => {
  it.each(['/latest.json?order=activity&page=0', '/t/62066.json?include_raw=true', '/site.json'])(
    'lets pixls ingestion read %s',
    (path) => expect(isAllowed(pixls, agent, path)).toBe(true),
  );

  it.each([
    '/search?q=darktable',
    '/admin/users',
    '/t/some-topic/62066.rss',
    '/latest.json?api_key=x',
  ])('honours the wildcard rules that disallow %s', (path) =>
    expect(isAllowed(pixls, agent, path)).toBe(false),
  );

  it('allows everything when there are no rules', () => {
    expect(isAllowed('', agent, '/t/1.json')).toBe(true);
  });

  it('prefers a group naming our agent over the * group', () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: community-voices\nDisallow: /private';

    expect(isAllowed(robots, agent, '/t/1.json')).toBe(true);
    expect(isAllowed(robots, agent, '/private/x')).toBe(false);
  });
});
