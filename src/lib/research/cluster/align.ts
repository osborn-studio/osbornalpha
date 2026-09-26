/**
 * WP-A5 entity alignment (plan §5.5): scan a source's title + text for the
 * A2 alias table and turn the hits into alignment decisions.
 *   0 candidates → nothing; 1 → aligned (rule); ≥2 → ambiguous (await human/Jev).
 * Aliases shorter than MIN_ALIAS characters are skipped: they are too ambiguous
 * to align on ("AI", "金"). Latin aliases match on word boundaries, case-
 * insensitively; CJK aliases match anywhere.
 */

export interface AliasEntry { entity_id: string; alias: string }
export interface Candidate { entity_id: string; alias: string; hits: number; position: number }
export type AlignmentStatus = 'aligned' | 'ambiguous' | 'rejected';
export interface AlignmentDecision {
  entity_id: string;
  method: 'rule';
  status: AlignmentStatus;
  confidence: number | null;
  evidence: { alias: string; hits: number; position: number };
}

export const MIN_ALIAS = 3;
const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function aliasPattern(alias: string): RegExp {
  const body = escape(alias);
  // \b is ASCII-only; a Latin alias followed by a CJK char still counts as a word end.
  return CJK.test(alias) ? new RegExp(body, 'gu') : new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
}

/** One candidate per entity: hits summed over all its aliases, earliest position. */
export function findCandidates(source: { title: string; raw_text: string }, aliases: AliasEntry[]): Candidate[] {
  const text = `${source.title}\n${source.raw_text}`;
  const perEntity = new Map<string, Candidate & { bestAliasHits: number }>();
  for (const { entity_id, alias } of aliases) {
    const a = alias.trim();
    if (a.length < MIN_ALIAS) continue;
    const re = aliasPattern(a);
    let hits = 0; let position = -1; let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) { if (position < 0) position = m.index; hits++; if (m[0].length === 0) re.lastIndex++; }
    if (hits === 0) continue;
    const cur = perEntity.get(entity_id);
    if (!cur) { perEntity.set(entity_id, { entity_id, alias: a, hits, position, bestAliasHits: hits }); continue; }
    // hits and position aggregate over every alias; evidence names the alias seen most.
    cur.hits += hits; cur.position = Math.min(cur.position, position);
    if (hits > cur.bestAliasHits) { cur.alias = a; cur.bestAliasHits = hits; }
  }
  return [...perEntity.values()].map(({ bestAliasHits: _b, ...c }) => c)
    .sort((x, y) => y.hits - x.hits || x.position - y.position || x.entity_id.localeCompare(y.entity_id));
}

/** Rule confidence: 0.6 base + 0.1 per extra hit, capped at 1. */
export function ruleConfidence(hits: number): number { return Math.min(1, Math.round((0.6 + 0.1 * hits) * 1000) / 1000); }

export function decideAlignments(candidates: Candidate[]): AlignmentDecision[] {
  if (candidates.length === 0) return [];
  const status: AlignmentStatus = candidates.length === 1 ? 'aligned' : 'ambiguous';
  return candidates.map(c => ({
    entity_id: c.entity_id, method: 'rule', status,
    confidence: status === 'aligned' ? ruleConfidence(c.hits) : null,
    evidence: { alias: c.alias, hits: c.hits, position: c.position },
  }));
}
