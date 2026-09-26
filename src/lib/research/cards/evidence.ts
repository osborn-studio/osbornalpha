/**
 * WP-A8 evidence selection (plan §7.1.2): from one week of judgment-ledger rows,
 * keep (source, thesis) pairs that at least one backend judged relevant (Q1),
 * that are first in their cluster, that nobody judged a retelling (Q3/Q5), and
 * whose text may leave the machine (public, not a private observation, not an
 * S4 controlled copy — the generator is an external model). Pure.
 */
import { mayLeaveMachine } from '../fanout/run';
import type { SourceDocument } from '../types';

export interface LedgerRow {
  id: string; source_id: string; thesis_id: string; question_id: string; backend: string; selected: string | null; abstained: boolean;
}
export type EvidenceDirection = 'support' | 'counter';
export interface EvidenceItem {
  source_id: string; source_version: string; judgment_ids: string[];
  /** Q3 origin class: a non-rule, non-abstained answer wins; then rule; then 'unknown'. */
  origin: string; host: string; unfamiliar: boolean; direction: EvidenceDirection;
}
export interface ThesisEvidence { thesis_id: string; support: EvidenceItem[]; counter: EvidenceItem[]; independent_sources: number; unfamiliar_hosts: string[] }
export interface EvidenceInput { rows: LedgerRow[]; sources: SourceDocument[]; priorHosts: Set<string> }
export interface EvidenceOutput { theses: ThesisEvidence[]; excluded_private: number }

export function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function originOf(rows: LedgerRow[]): string {
  const q3 = rows.filter(r => r.question_id === 'Q3' && !r.abstained && r.selected);
  return q3.find(r => r.backend !== 'rule')?.selected ?? q3.find(r => r.backend === 'rule')?.selected ?? 'unknown';
}

export function collectEvidence({ rows, sources, priorHosts }: EvidenceInput): EvidenceOutput {
  const byId = new Map(sources.map(s => [s.id, s]));
  const pairs = new Map<string, LedgerRow[]>();
  for (const r of rows) (pairs.get(`${r.source_id}|${r.thesis_id}`) ?? pairs.set(`${r.source_id}|${r.thesis_id}`, []).get(`${r.source_id}|${r.thesis_id}`)!).push(r);
  const theses = new Map<string, ThesisEvidence>();
  const privateSources = new Set<string>();
  for (const [key, group] of pairs) {
    const [source_id, thesis_id] = key.split('|');
    const source = byId.get(source_id);
    if (!source) continue;
    const answered = (q: string, v: string) => group.some(r => r.question_id === q && !r.abstained && r.selected === v);
    if (!answered('Q1', 'true')) continue;
    if (source.cluster_first === false) continue;
    if (answered('Q3', 'retelling') || answered('Q5', 'true')) continue;
    if (!mayLeaveMachine(source)) { privateSources.add(source_id); continue; }
    const support = answered('Q2', 'support');
    const counter = answered('Q2', 'weaken') || answered('Q2', 'trigger_invalidation');
    if (!support && !counter) continue;
    const host = hostOf(source.url);
    const base = { source_id, source_version: source.source_version ?? '1', judgment_ids: group.map(r => r.id), origin: originOf(group), host, unfamiliar: host !== '' && !priorHosts.has(host) };
    const t = theses.get(thesis_id) ?? theses.set(thesis_id, { thesis_id, support: [], counter: [], independent_sources: 0, unfamiliar_hosts: [] }).get(thesis_id)!;
    if (support) t.support.push({ ...base, direction: 'support' });
    if (counter) t.counter.push({ ...base, direction: 'counter' });
  }
  const out = [...theses.values()].map(t => {
    const all = [...t.support, ...t.counter];
    const sortItems = (a: EvidenceItem, b: EvidenceItem) => a.source_id.localeCompare(b.source_id);
    t.support.sort(sortItems); t.counter.sort(sortItems);
    t.independent_sources = new Set(all.map(e => `${e.origin}|${e.host}`)).size;
    t.unfamiliar_hosts = [...new Set(all.filter(e => e.unfamiliar).map(e => e.host))].sort();
    return t;
  });
  out.sort((a, b) => (b.support.length + b.counter.length) - (a.support.length + a.counter.length) || a.thesis_id.localeCompare(b.thesis_id));
  return { theses: out, excluded_private: privateSources.size };
}
