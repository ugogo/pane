// Tiny fuzzy subsequence matcher with scoring + match-index highlighting.
// Good enough for a command palette; not trying to be fzf.

export interface FuzzyResult {
  matched: boolean;
  score: number;
  indices: number[];
}

export function fuzzyMatch(query: string, target: string): FuzzyResult {
  const q = query.trim().toLowerCase();
  if (!q) return { matched: true, score: 0, indices: [] };
  const t = target.toLowerCase();

  let qi = 0;
  let score = 0;
  let lastIdx = -2;
  const indices: number[] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      // Bonuses: consecutive match, word boundary, start of string.
      if (ti === lastIdx + 1) score += 8;
      if (ti === 0 || /[\s\-_/.]/.test(t[ti - 1])) score += 12;
      score += 4;
      lastIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return { matched: false, score: 0, indices: [] };
  // Prefer shorter targets and earlier first hit.
  score -= Math.floor(t.length / 6);
  score -= indices[0] ?? 0;
  return { matched: true, score, indices };
}

export function fuzzyFilter<T>(
  query: string,
  items: T[],
  key: (item: T) => string,
): { item: T; result: FuzzyResult }[] {
  return items
    .map((item) => ({ item, result: fuzzyMatch(query, key(item)) }))
    .filter((r) => r.result.matched)
    .sort((a, b) => b.result.score - a.result.score);
}
