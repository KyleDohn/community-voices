interface Group {
  agents: string[];
  disallow: string[];
}

const parseGroups = (robotsTxt: string): Group[] => {
  const groups: Group[] = [];
  let current: Group | undefined;
  let readingAgents = false;
  for (const line of robotsTxt.split(/\r?\n/)) {
    const [field = '', ...rest] = (line.split('#')[0] ?? '').split(':');
    const key = field.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!readingAgents) groups.push((current = { agents: [], disallow: [] }));
      current!.agents.push(value.toLowerCase());
      readingAgents = true;
    } else if (key) {
      readingAgents = false;
      if (key === 'disallow' && value && current) current.disallow.push(value);
    }
  }
  return groups;
};

/** `*` matches any run of characters and a trailing `$` anchors the end, as crawlers interpret them. */
const toRegExp = (rule: string) => {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
};

/** Whether robots.txt lets `userAgent` fetch `path` (path plus query). A group naming us beats `*`. */
export const isAllowed = (robotsTxt: string, userAgent: string, path: string) => {
  const groups = parseGroups(robotsTxt);
  const product = userAgent.split('/')[0]!.toLowerCase();
  const group =
    groups.find((g) => g.agents.includes(product)) ?? groups.find((g) => g.agents.includes('*'));
  return !group?.disallow.some((rule) => toRegExp(rule).test(path));
};
