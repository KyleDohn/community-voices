import { describe, expect, it } from 'vitest';
import { seedFileName } from './seed';

const window = { start: new Date('2026-10-05T00:00:00Z'), end: new Date('2026-11-02T00:00:00Z') };

describe('seedFileName', () => {
  it('names the file after the whole forum host and the window', () => {
    expect(seedFileName('https://discuss.pixls.us', window)).toBe(
      'discuss-pixls-us-2026-10-05-2026-11-02.json',
    );
  });

  it('keeps multi-part TLDs and ignores the path', () => {
    expect(seedFileName('https://forum.example.co.uk/community/', window)).toBe(
      'forum-example-co-uk-2026-10-05-2026-11-02.json',
    );
  });
});
