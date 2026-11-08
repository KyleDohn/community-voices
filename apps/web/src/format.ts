const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-10-26` → "26 Oct – 1 Nov 2026": the Monday-to-Sunday week it starts. */
export const weekRange = (weekStart: string) => {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return `${day.format(start)} – ${dayYear.format(end)}`;
};

/** Small amounts need more digits than cents: a theme extraction costs a fraction of one. */
export const usd = (amount: number) => `$${amount < 0.1 ? amount.toFixed(4) : amount.toFixed(2)}`;

export const tokens = (n: number) => n.toLocaleString('en-US');
