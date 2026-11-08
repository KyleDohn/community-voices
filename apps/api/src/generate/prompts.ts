import type { RetrievedChunk } from '../retrieve/retrieve-week';
import type { ThemeTrend } from '../retrieve/trend-lookup';
import type { LlmMessage } from './llm-client';

export const COMMUNITY =
  'discuss.pixls.us, a forum for photographers who use free and open-source software such as ' +
  'darktable, RawTherapee, GIMP and ART';

export interface Prompt {
  system: string;
  messages: LlmMessage[];
}

/** Trend examples only need enough text to check they are on topic. */
const EXAMPLE_CHARS = 300;

const postBlock = (c: RetrievedChunk) =>
  `[post ${c.postId}] ${c.topicTitle} (found by: ${c.facets.map((f) => f.facetId).join(', ')})\n${c.text}`;

const postsSection = (chunks: RetrievedChunk[]) => chunks.map(postBlock).join('\n\n');

export const extractPrompt = (week: string, chunks: RetrievedChunk[]): Prompt => ({
  system: `You read posts from ${COMMUNITY}, and name what the week's discussion was about.`,
  messages: [
    {
      role: 'user',
      content:
        `Below are ${chunks.length} posts from the week starting ${week}.\n\n` +
        'Name 4 to 6 distinct themes that several of these posts share. Write each theme as one plain ' +
        'sentence describing the kind of discussion, specific enough to search for, e.g. "Users report ' +
        'colour shifts in exports after upgrading darktable". Not a one-word label. Use only these posts.\n\n' +
        postsSection(chunks),
    },
  ],
});

const trendSection = (trends: ThemeTrend[], poolSize: number) =>
  trends
    .map(({ theme, weeks }) => {
      const counts = weeks.map((w) => `${w.weekStart}: ${w.matches}`).join(', ');
      const examples = weeks
        .flatMap((w) =>
          w.examples.map(
            (e) =>
              `  [post ${e.postId}] (${w.weekStart}) ${e.topicTitle}: ` +
              e.text.replace(/\s+/g, ' ').slice(0, EXAMPLE_CHARS),
          ),
        )
        .join('\n');
      return `Theme: ${theme}\nShare of the ${poolSize} nearest posts, by week: ${counts}\nExamples:\n${examples}`;
    })
    .join('\n\n');

const ROLE = `You write a weekly report about ${COMMUNITY}, for the people who run it.`;
const NO_INVENTION =
  'If the posts do not support a section, say "Insufficient evidence" in its text, or leave the list ' +
  'empty. Never invent posts, people, versions or events.';
const APPROX_COUNT =
  'approxPostCount is your estimate of how many of the supplied posts discuss the theme.';

const WRITE_SYSTEM = [
  ROLE,
  'Use only the posts in the user message. Do not use outside knowledge about the forum, its software ' +
    'or its members.',
  'Cite the posts behind every theme, notable thread, mood and prediction, as the integer ids from the ' +
    '[post N] labels. Themes, notable threads and mood cite only posts from the target week. ' +
    'Predictions may also cite trend examples from earlier weeks.',
  NO_INVENTION,
  "Trend counts are weak hints. Each is a week's share of the posts nearest to the theme across four " +
    'weeks: small differences mean nothing, and some matches may be off topic, so check the examples. ' +
    'Give a prediction low confidence by default, medium when the examples clearly back it, and high ' +
    'only for something the posts announce outright.',
  APPROX_COUNT,
].join('\n\n');

export const writePrompt = (
  week: string,
  chunks: RetrievedChunk[],
  trends: ThemeTrend[],
  poolSize: number,
): Prompt => ({
  system: WRITE_SYSTEM,
  messages: [
    {
      role: 'user',
      content:
        `Write the report for the week starting ${week}.\n\n` +
        `## Posts from the target week\n\n${postsSection(chunks)}\n\n` +
        `## Trend evidence: this week against the three before it\n\n${trendSection(trends, poolSize)}`,
    },
  ],
});

// The RAG writer's rules, minus the supplied posts and trends: retrieval is the only difference.
const NO_RAG_SYSTEM = [
  ROLE,
  'Cite the posts behind every theme, notable thread, mood and prediction, as integer forum post ids.',
  NO_INVENTION,
  'Give a prediction low confidence by default, medium when evidence clearly backs it, and high only ' +
    'for something announced outright.',
  APPROX_COUNT,
].join('\n\n');

export const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Variant A: only the forum, its description and the dates (ASSUMPTIONS #2). */
export const noRagPrompt = (week: string): Prompt => ({
  system: NO_RAG_SYSTEM,
  messages: [
    {
      role: 'user',
      content: `Write the report for the week from ${week} to ${addDays(week, 6)} (Monday to Sunday, UTC).`,
    },
  ],
});

export const repairMessage = (errors: string[]): LlmMessage => ({
  role: 'user',
  content:
    'That output failed validation:\n' +
    errors.map((e) => `- ${e}`).join('\n') +
    '\n\nReturn the complete corrected JSON.',
});
