import type { UniverseRow } from '../data/mock';

export interface SearchResult extends UniverseRow {
  score: number;
}

export function searchUniverse(
  universe: UniverseRow[],
  query: string,
  limit = 8
): SearchResult[] {
  if (!query || query.trim().length < 1) return [];
  const q = query.toLowerCase().trim();
  const scored: SearchResult[] = [];
  for (const item of universe) {
    const t = item.t.toLowerCase();
    const n = item.n.toLowerCase();
    const py = (item.py || '').toLowerCase();
    let score = 0;
    if (t === q) score = 100;
    else if (t.startsWith(q)) score = 50;
    else if (n === q) score = 45;
    else if (n.startsWith(q)) score = 40;
    else if (py.startsWith(q)) score = 30;
    else if (t.includes(q)) score = 20;
    else if (n.includes(q)) score = 15;
    else if (py.includes(q)) score = 10;
    if (score > 0) scored.push({ ...item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
