/**
 * WP-A9 weekend decision flow (plan §7.1.3, §7.2): freeze the human baseline before any card
 * is shown, reveal that week's change cards, record the AI candidate stance per card once, and
 * record the human's collab decision per card. Arms live in the A3 ledger (S4 pool); cards are
 * read through an injected reader (A8 `listCards`). No observation is created here (see spec).
 */
import { transaction, serverTime, type S4Actor } from '../s4/db';
import { DECISION_ACTIONS, isUuid, recordDecision, type DecisionAction } from '../s4/ledger';
import { fail } from '../ingest/pa-v1/json.js';
import type { ResearchCard } from '../types';

export type CardReader = (weekOf: string) => Promise<ResearchCard[]>;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const weekOk = (w: unknown): w is string => typeof w === 'string' && ISO_DATE.test(w) && Number.isFinite(Date.parse(w));
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 4000;

interface LedgerDecision { id: string; thesis_id: string; arm: string; action: string; reason: string; card_id: string | null; time_spent_minutes: number | null; frozen_at: string | null; observation_id: string | null; created_at: string }

async function weekDecisions(actor: S4Actor, weekOf: string): Promise<LedgerDecision[]> {
  return transaction(actor, async db => (await db.query(
    `select id,thesis_id,arm,action,reason,card_id,time_spent_minutes,frozen_at,observation_id,created_at from public.research_decisions
      where user_id=$1 and week_of=$2::date order by created_at,id`, [actor.userId, weekOf])).rows.map((r: any) => ({ ...r, frozen_at: r.frozen_at?.toISOString?.() ?? r.frozen_at, created_at: r.created_at.toISOString() })));
}
/** Cited judgments must exist in the owner's ledger; unknown ids (e.g. from a card generated elsewhere) are dropped. */
async function existingJudgments(actor: S4Actor, ids: string[]): Promise<string[]> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (!valid.length) return [];
  return transaction(actor, async db => (await db.query('select id from public.research_judgments where user_id=$1 and id=any($2::uuid[]) order by id', [actor.userId, valid])).rows.map((r: any) => r.id));
}
const cardJudgments = (card: ResearchCard) => card.assertions.flatMap(a => a.judgment_ids);

export interface WeeklyThesis { thesis_id: string; card_count: number; cards: ResearchCard[] | null; baseline: LedgerDecision | null; collab_by_card: Record<string, LedgerDecision>; ai_candidate_by_card: Record<string, LedgerDecision> }
export interface WeeklyStatus { week_of: string; theses: WeeklyThesis[]; locked_theses: string[]; all_unlocked: boolean }

/** Cards are only returned for theses whose human baseline for that week is frozen (server-side gate). */
export async function weeklyStatus({ actor, readCards, weekOf }: { actor: S4Actor; readCards: CardReader; weekOf: string }): Promise<WeeklyStatus> {
  if (!weekOk(weekOf)) fail('invalid_schema');
  const [cards, decisions] = await Promise.all([readCards(weekOf), weekDecisions(actor, weekOf)]);
  const byThesis = new Map<string, ResearchCard[]>();
  for (const c of cards) (byThesis.get(c.thesis_id) ?? byThesis.set(c.thesis_id, []).get(c.thesis_id)!).push(c);
  for (const d of decisions) if (!byThesis.has(d.thesis_id)) byThesis.set(d.thesis_id, []);
  const theses: WeeklyThesis[] = [...byThesis.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([thesis_id, list]) => {
    const own = decisions.filter(d => d.thesis_id === thesis_id);
    const baseline = own.find(d => d.arm === 'human_baseline') ?? null;
    const byCard = (arm: string) => Object.fromEntries(own.filter(d => d.arm === arm && d.card_id).map(d => [d.card_id!, d]));
    return { thesis_id, card_count: list.length, cards: baseline ? list : null, baseline, collab_by_card: byCard('collab'), ai_candidate_by_card: byCard('ai_candidate') };
  });
  const locked_theses = theses.filter(t => t.card_count > 0 && !t.baseline).map(t => t.thesis_id);
  return { week_of: weekOf, theses, locked_theses, all_unlocked: locked_theses.length === 0 };
}

export async function freezeBaseline({ actor, weekOf, thesis_id, action, reason, analyst_id }: { actor: S4Actor; weekOf: string; thesis_id: string; action: DecisionAction; reason: string; analyst_id?: string | null }) {
  if (!weekOk(weekOf) || !isUuid(thesis_id) || !DECISION_ACTIONS.includes(action) || !text(reason)) fail('invalid_schema');
  const existing = (await weekDecisions(actor, weekOf)).find(d => d.thesis_id === thesis_id && d.arm === 'human_baseline');
  if (existing) fail('idempotency_conflict');
  const frozen_at = await transaction(actor, db => serverTime(db));
  const made = await recordDecision(actor, { thesis_id, week_of: weekOf, arm: 'human_baseline', action, reason, frozen_at, analyst_id: analyst_id ?? null });
  return { ...made, arm: 'human_baseline' as const, frozen_at };
}

/** Reveal cards of unlocked theses; record the AI candidate stance for each newly shown card exactly once. */
export async function revealCards({ actor, readCards, weekOf }: { actor: S4Actor; readCards: CardReader; weekOf: string }) {
  const status = await weeklyStatus({ actor, readCards, weekOf });
  const visible = status.theses.filter(t => t.cards).flatMap(t => t.cards!.map(c => ({ card: c, seen: !!t.ai_candidate_by_card[c.id] })));
  let ai_candidate_recorded = 0;
  for (const { card, seen } of visible) {
    if (seen || card.status === 'blocked') continue;
    const cited = await existingJudgments(actor, cardJudgments(card));
    await recordDecision(actor, { thesis_id: card.thesis_id, week_of: weekOf, arm: 'ai_candidate', action: card.kind === 'evidence' ? 'adopt' : 'reject',
      reason: `change card ${card.kind} generated by ${card.generation.model}`, card_id: card.id, cited_judgment_ids: cited });
    ai_candidate_recorded++;
  }
  return { week_of: weekOf, cards: visible.map(v => v.card), ai_candidate_recorded };
}

export async function decideCard({ actor, readCards, weekOf, card_id, action, reason, time_spent_minutes, observation_id }: { actor: S4Actor; readCards: CardReader; weekOf: string; card_id: string; action: DecisionAction; reason: string; time_spent_minutes: number | null; observation_id?: string | null }) {
  if (!weekOk(weekOf) || !isUuid(card_id) || !DECISION_ACTIONS.includes(action) || !text(reason)) fail('invalid_schema');
  if (time_spent_minutes != null && !(Number.isSafeInteger(time_spent_minutes) && time_spent_minutes >= 0)) fail('invalid_schema');
  const card = (await readCards(weekOf)).find(c => c.id === card_id);
  if (!card) fail('scope_denied');
  const status = await weeklyStatus({ actor, readCards, weekOf });
  const thesis = status.theses.find(t => t.thesis_id === card.thesis_id);
  if (!thesis?.baseline) fail('policy_blocked');
  if (thesis.collab_by_card[card_id]) fail('idempotency_conflict');
  const cited = await existingJudgments(actor, cardJudgments(card));
  const made = await recordDecision(actor, { thesis_id: card.thesis_id, week_of: weekOf, arm: 'collab', action, reason, card_id, cited_judgment_ids: cited, time_spent_minutes: time_spent_minutes ?? null, observation_id: observation_id ?? null });
  return { ...made, arm: 'collab' as const, card_id };
}

/** S4 observations already registered for a thesis: Observation → Decision.card_ref → ChangeCard.thesis_id. */
export async function thesisObservations({ actor, thesis_id }: { actor: S4Actor; thesis_id: string }) {
  if (!isUuid(thesis_id)) fail('invalid_schema');
  return transaction(actor, async db => (await db.query(
    `select o.id as observation_id,s.status,s.anchor_status,o.recorded_at
       from public.research_s4_records o
       join public.research_s4_observation_state s on s.user_id=o.user_id and s.observation_id=o.id
       join public.research_s4_records d on d.user_id=o.user_id and d.kind='Decision' and d.id=(o.payload->>'decision_or_candidate_ref')::uuid
       join public.research_s4_records c on c.user_id=o.user_id and c.kind='ChangeCard' and c.id=(d.payload->>'card_ref')::uuid
      where o.user_id=$1 and o.kind='Observation' and c.payload->>'thesis_id'=$2
      order by o.recorded_at desc`, [actor.userId, thesis_id])).rows.map((r: any) => ({ observation_id: r.observation_id, status: r.status, anchor_status: r.anchor_status, recorded_at: r.recorded_at.toISOString() })));
}
