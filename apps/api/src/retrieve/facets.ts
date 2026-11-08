import type { Facet } from './retrieve-week';

/**
 * What a weekly report on the forum should cover. Each query describes the kind of post, not the
 * products in it: naming tools pulled in any post that mentioned them (DESIGN, "Retrieval").
 */
export const FACETS: Facet[] = [
  {
    id: 'releases',
    label: 'New software releases',
    query:
      'Announcing a new release: version 2.0 is out, with new features, a changelog and download links.',
  },
  {
    id: 'help',
    label: 'Help requests and bugs',
    query: 'I need help: something is not working, crashes or gives an error. How do I fix it?',
  },
  {
    id: 'edits',
    label: 'Photo edits and critiques (Play Raw)',
    query: 'Here is my edit of the raw file, with the processing steps I used. Feedback welcome.',
  },
  {
    id: 'events',
    label: 'Community events',
    query:
      "Join this month's community photo challenge: the theme, the rules and the deadline to take part.",
  },
  {
    id: 'frustrations',
    label: 'Complaints and frustrations',
    query: 'I am frustrated and disappointed; this change made the workflow worse and annoys me.',
  },
];
