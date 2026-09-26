/**
 * WP-A9 weekend decision flow (plan §7.1.3, §7.2): freeze the human baseline before any card
 * is shown, reveal that week's change cards (recording the AI candidate stance per card once),
 * then record the human's collab decision per card. Arms live in the A3 ledger (S4 pool); cards
 * are read through an injected reader (A8 `listCards`). Every check-then-append runs inside one
 * owner transaction, so concurrent requests serialize on the owner lock instead of duplicating
 * immutable decisions. Card exposure through any read path is recorded; a baseline frozen after
 * exposure would not be independent, so it is refused (`exposure_required`).
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction, serverTime, type S4Actor } from '../s4/db';
import { DECISION_ACTIONS, isUuid, recordDecisionWithin, type DecisionAction } from '../s4/ledger';
import { canonicalize, fail } from '../ingest/pa-v1/json.js';
import type { ResearchCard } from '../types';

export type CardReader = (weekOf: string) => Promise<ResearchCard[]>;
export const EXPOSURE_ACTION = 'weekly.cards_exposed';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const weekOk = (w: unknown): w is string => typeof w === 'string' && ISO_DATE.test(w) && Number.isFinite(Date.parse(w));
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 4000;

export interface LedgerDecision { id: string; thesis_id: string; arm: string; action: string; reason: string; card_id: string | null; time_spent_minutes: number | null; frozen_at: string | null; observation_id: string | null; created_at: string }
interface Exposure { thesis_id: string; week_of: string; created_at: string }

async function weekDecisions(db: PoolClient, actor: S4Actor, weekOf: string): Promise<LedgerDecision[]> {
  return (await db.query(`select id,thesis_id,arm,action,reason,card_id,time_spent_minutes,frozen_at,observation_id,created_at from public.research_decisions
      where user_id=$1 and week_of=$2::date order by created_at,id`, [actor.userId, weekOf])).rows
    .map((r: any) => ({ ...r, frozen_at: r.frozen_at?.toISOString?.() ?? r.frozen_at, created_at: r.created_at.toISOString() }));
}
async function weekExposures(db: PoolClient, actor: S4Actor, weekOf: string): Promise<Exposure[]> {
  return (await db.query(`select detail->>'thesis_id' as thesis_id,detail->>'week_of' as week_of,created_at from public.research_audit_log
      where user_id=$1 and action=$2 and detail->>'week_of'=$3 order by created_at`, [actor.userId, EXPOSURE_ACTION, weekOf])).rows
    .map((r: any) => ({ thesis_id: r.thesis_id, week_of: r.week_of, created_at: r.created_at.toISOString() }));
}
/** Cited judgments must exist in the owner's ledger; unknown ids (e.g. from a card generated elsewhere) are dropped. */
async function existingJudgments(db: PoolClient, actor: S4Actor, ids: string[]): Promise<string[]> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (!valid.length) return [];
  return (await db.query('select id from public.research_judgments where user_id=$1 and id=any($2::uuid[]) order by id', [actor.userId, valid])).rows.map((r: any) => r.id);
}
const cardJudgments = (card: ResearchCard) => card.assertions.flatMap(a => a.judgment_ids);
const decidable = (card: ResearchCard) => card.status !== 'blocked';

async function writeExposure(db: PoolClient, actor: S4Actor, cards: ResearchCard[], origin: string) {
  const groups = new Map<string, ResearchCard[]>();
  for (const c of cards) (groups.get(`${c.week_of}|${c.thesis_id}`) ?? groups.set(`${c.week_of}|${c.thesis_id}`, []).get(`${c.week_of}|${c.thesis_id}`)!).push(c);
  let written = 0;
  for (const [key, list] of groups) {
    const [week_of, thesis_id] = key.split('|');
    const already = (await db.query(`select 1 from public.research_audit_log where user_id=$1 and action=$2 and detail->>'week_of'=$3 and detail->>'thesis_id'=$4 limit 1`, [actor.userId, EXPOSURE_ACTION, week_of, thesis_id])).rowCount;
    if (already) continue;
    await db.query(`insert into public.research_audit_log(id,user_id,actor,action,object_type,object_id,detail,created_at) values($1,$2,$3,$4,'weekly',null,$5,$6)`,
      [randomUUID(), actor.userId, actor.kind, EXPOSURE_ACTION, canonicalize({ week_of, thesis_id, card_ids: list.map(c => c.id).sort(), origin }), await serverTime(db)]);
    written++;
  }
  return written;
}
/** Any read path that shows cards (cards page, weekly reveal) records exposure per thesis-week, once. */
export async function recordCardExposure({ actor, cards, origin }: { actor: S4Actor; cards: ResearchCard[]; origin: string }) {
  if (!cards.length) return { written: 0 };
  return transaction(actor, async db => ({ written: await writeExposure(db, actor, cards, origin) }));
}

export interface WeeklyThesis { thesis_id: string; card_count: number; cards: ResearchCard[] | null; revealed: boolean; exposed_before_baseline: boolean; baseline: LedgerDecision | null; collab_by_card: Record<string, LedgerDecision>; ai_candidate_by_card: Record<string, LedgerDecision> }
export interface WeeklyStatus { week_of: string; theses: WeeklyThesis[]; locked_theses: string[]; all_unlocked: boolean }

function buildStatus(weekOf: string, cards: ResearchCard[], decisions: LedgerDecision[], exposures: Exposure[]): WeeklyStatus {
  const byThesis = new Map<string, ResearchCard[]>();
  for (const c of cards) (byThesis.get(c.thesis_id) ?? byThesis.set(c.thesis_id, []).get(c.thesis_id)!).push(c);
  for (const d of decisions) if (!byThesis.has(d.thesis_id)) byThesis.set(d.thesis_id, []);
  const theses: WeeklyThesis[] = [...byThesis.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([thesis_id, list]) => {
    const own = decisions.filter(d => d.thesis_id === thesis_id);
    const baseline = own.find(d => d.arm === 'human_baseline') ?? null;
    const byCard = (arm: string) => Object.fromEntries(own.filter(d => d.arm === arm && d.card_id).map(d => [d.card_id!, d]));
    const ai = byCard('ai_candidate');
    const revealed = !!baseline && list.filter(decidable).every(c => ai[c.id]) && list.length > 0;
    const firstExposure = exposures.find(e => e.thesis_id === thesis_id)?.created_at ?? null;
    const exposed_before_baseline = firstExposure !== null && (!baseline || firstExposure < baseline.created_at);
    return { thesis_id, card_count: list.length, cards: revealed ? list : null, revealed, exposed_before_baseline, baseline, collab_by_card: byCard('collab'), ai_candidate_by_card: ai };
  });
  const locked_theses = theses.filter(t => t.card_count > 0 && !t.baseline).map(t => t.thesis_id);
  return { week_of: weekOf, theses, locked_theses, all_unlocked: locked_theses.length === 0 };
}

/** Cards are only returned for theses whose baseline is frozen AND whose cards were revealed (AI stance recorded). */
export async function weeklyStatus({ actor, readCards, weekOf }: { actor: S4Actor; readCards: CardReader; weekOf: string }): Promise<WeeklyStatus> {
  if (!weekOk(weekOf)) fail('invalid_schema');
  const cards = await readCards(weekOf);
  return transaction(actor, async db => buildStatus(weekOf, cards, await weekDecisions(db, actor, weekOf), await weekExposures(db, actor, weekOf)));
}

export async function freezeBaseline({ actor, weekOf, thesis_id, action, reason, analyst_id }: { actor: S4Actor; weekOf: string; thesis_id: string; action: DecisionAction; reason: string; analyst_id?: string | null }) {
  if (!weekOk(weekOf) || !isUuid(thesis_id) || !DECISION_ACTIONS.includes(action) || !text(reason)) fail('invalid_schema');
  return transaction(actor, async db => {
    if ((await weekDecisions(db, actor, weekOf)).some(d => d.thesis_id === thesis_id && d.arm === 'human_baseline')) fail('idempotency_conflict');
    // A baseline recorded after this thesis-week's cards were shown anywhere is not an independent baseline.
    if ((await weekExposures(db, actor, weekOf)).some(e => e.thesis_id === thesis_id)) fail('exposure_required');
    const frozen_at = await serverTime(db);
    const made = await recordDecisionWithin(db, actor, { thesis_id, week_of: weekOf, arm: 'human_baseline', action, reason, frozen_at, analyst_id: analyst_id ?? null });
    return { ...made, arm: 'human_baseline' as const, frozen_at };
  });
}

/** Reveal cards of baseline-frozen theses; record the AI stance for each newly shown decidable card exactly once, then mark exposure. */
export async function revealCards({ actor, readCards, weekOf }: { actor: S4Actor; readCards: CardReader; weekOf: string }) {
  if (!weekOk(weekOf)) fail('invalid_schema');
  const cards = await readCards(weekOf);
  return transaction(actor, async db => {
    const decisions = await weekDecisions(db, actor, weekOf);
    const baselines = new Set(decisions.filter(d => d.arm === 'human_baseline').map(d => d.thesis_id));
    const seen = new Set(decisions.filter(d => d.arm === 'ai_candidate' && d.card_id).map(d => d.card_id!));
    const visible = cards.filter(c => baselines.has(c.thesis_id));
    let ai_candidate_recorded = 0;
    for (const card of visible) {
      if (seen.has(card.id) || !decidable(card)) continue;
      await recordDecisionWithin(db, actor, { thesis_id: card.thesis_id, week_of: weekOf, arm: 'ai_candidate', action: card.kind === 'evidence' ? 'adopt' : 'reject',
        reason: `change card ${card.kind} generated by ${card.generation.model}`, card_id: card.id, cited_judgment_ids: await existingJudgments(db, actor, cardJudgments(card)) });
      ai_candidate_recorded++;
    }
    await writeExposure(db, actor, visible, 'weekly_reveal');
    return { week_of: weekOf, cards: visible, ai_candidate_recorded };
  });
}

export async function decideCard({ actor, readCards, weekOf, card_id, action, reason, time_spent_minutes, observation_id }: { actor: S4Actor; readCards: CardReader; weekOf: string; card_id: string; action: DecisionAction; reason: string; time_spent_minutes: number | null; observation_id?: string | null }) {
  if (!weekOk(weekOf) || !isUuid(card_id) || !DECISION_ACTIONS.includes(action) || !text(reason)) fail('invalid_schema');
  if (time_spent_minutes != null && !(Number.isSafeInteger(time_spent_minutes) && time_spent_minutes >= 0)) fail('invalid_schema');
  const card = (await readCards(weekOf)).find(c => c.id === card_id);
  if (!card) { fail('scope_denied'); throw new Error('unreachable'); }
  return transaction(actor, async db => {
    const decisions = await weekDecisions(db, actor, weekOf);
    const own = decisions.filter(d => d.thesis_id === card.thesis_id);
    // Baseline frozen and this card revealed (AI stance on record) are preconditions for a collab decision.
    if (!own.some(d => d.arm === 'human_baseline') || !own.some(d => d.arm === 'ai_candidate' && d.card_id === card_id)) fail('policy_blocked');
    if (own.some(d => d.arm === 'collab' && d.card_id === card_id)) fail('idempotency_conflict');
    const made = await recordDecisionWithin(db, actor, { thesis_id: card.thesis_id, week_of: weekOf, arm: 'collab', action, reason, card_id, cited_judgment_ids: await existingJudgments(db, actor, cardJudgments(card)), time_spent_minutes: time_spent_minutes ?? null, observation_id: observation_id ?? null });
    return { ...made, arm: 'collab' as const, card_id };
  });
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
