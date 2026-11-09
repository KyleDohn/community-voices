/** Post id → footnote number, in the order the document first cites each post. */
export const numberSources = (groups: number[][]) => {
  const numbers = new Map<number, number>();
  for (const id of groups.flat()) if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
  return numbers;
};

/** `[2, 6, 7, 8]` → "2,6–8": a run of three or more reads better as a range. */
export const footnoteLabel = (numbers: number[]) => {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const n of sorted) {
    const run = runs.at(-1);
    if (run && n === run.at(-1)! + 1) run.push(n);
    else runs.push([n]);
  }
  return runs.flatMap((r) => (r.length >= 3 ? [`${r[0]}–${r.at(-1)}`] : r.map(String))).join(',');
};
