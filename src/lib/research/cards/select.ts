/**
 * WP-A8 card selection (plan §7.1.2): ≤4 evidence cards by evidence volume plus
 * one fixed counter card — the thesis with the most counter-evidence, else the
 * thesis with unfamiliar sources, else none. At most five cards. Pure.
 */
import type { CardKind } from '../types';
import type { ThesisEvidence } from './evidence';

export const MAX_EVIDENCE_CARDS = 4;
export type CounterCardReason = 'counter_evidence' | 'unfamiliar_source' | 'none';
export interface SelectedCard { kind: CardKind; thesis_id: string; evidence: ThesisEvidence }
export interface Selection { cards: SelectedCard[]; counter_card: CounterCardReason }

export function selectCards(theses: ThesisEvidence[]): Selection {
  if (theses.length === 0) return { cards: [], counter_card: 'none' };
  const volume = (t: ThesisEvidence) => t.support.length + t.counter.length;
  const ranked = [...theses].sort((a, b) => volume(b) - volume(a) || a.thesis_id.localeCompare(b.thesis_id));
  const cards: SelectedCard[] = ranked.slice(0, MAX_EVIDENCE_CARDS).map(t => ({ kind: 'evidence', thesis_id: t.thesis_id, evidence: t }));
  const byCounter = [...theses].filter(t => t.counter.length > 0).sort((a, b) => b.counter.length - a.counter.length || a.thesis_id.localeCompare(b.thesis_id));
  const unfamiliar = (t: ThesisEvidence) => [...t.support, ...t.counter].filter(e => e.unfamiliar).length;
  const byUnfamiliar = [...theses].filter(t => unfamiliar(t) > 0).sort((a, b) => unfamiliar(b) - unfamiliar(a) || a.thesis_id.localeCompare(b.thesis_id));
  let counter_card: CounterCardReason = 'none';
  const pick = byCounter[0] ?? byUnfamiliar[0];
  if (pick) {
    counter_card = byCounter[0] ? 'counter_evidence' : 'unfamiliar_source';
    cards.push({ kind: 'counter', thesis_id: pick.thesis_id, evidence: pick });
  }
  return { cards, counter_card };
}
