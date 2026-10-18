/**
 * WP-A10: one-time mapping of the personal hiphon-pm call journal into the A3 ledger.
 * The journal stays where it is (outside git) and is only read from a path the operator
 * passes; every call becomes a DRAFT historical thesis plus a human_baseline decision frozen
 * at the call time; manual_close events become outcomes. Pure helpers + an injectable runner.
 */
import type { CreateThesisInput } from '../theses';
import type { DecisionAction, DecisionInput, OutcomeInput } from '../s4/ledger';

export const RATINGS = ['strong_buy', 'buy', 'add', 'hold', 'trim', 'sell'] as const;
export type Rating = typeof RATINGS[number];
export interface HiphonCall {
  kind: 'call'; call_id: string; ts_utc: string; exchange_session: string; ticker: string; name: string; market: string; rating: Rating; thesis: string;
  entry_basis: string; entry_price_ref: number; target_pct: number; stop_price?: number; stop_pct: number; size_pct: number; horizon_days: number;
  signal_mix: string[]; chain_role: string | null; evidence: string | null; source: string;
}
export interface HiphonEvent { kind: 'event'; call_id: string; ts_utc: string; event: 'manual_close'; note?: string; ref_call_id?: string }
export interface Scorecard { closed: { n: number; hits: number; hit_rate: number | null; by_rating: Record<string, { n: number; hit_rate: number }> }; open: { n: number; unrealized_avg_pct: number | null } }

const isoInstant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v) && Number.isFinite(Date.parse(v));
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parseCallsJournal(raw: string): { calls: HiphonCall[]; events: HiphonEvent[] } {
  const calls: HiphonCall[] = [], events: HiphonEvent[] = [];
  const seen = new Set<string>();
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let r: any; try { r = JSON.parse(line); } catch { throw new Error(`line ${i + 1}: invalid JSON`); }
    if (r.kind === 'call') {
      for (const f of ['call_id', 'ts_utc', 'ticker', 'name', 'market', 'rating', 'thesis']) if (!text(r[f])) throw new Error(`line ${i + 1}: call.${f} is required`);
      if (!isoInstant(r.ts_utc)) throw new Error(`line ${i + 1}: call.ts_utc must be an ISO UTC instant`);
      if (!RATINGS.includes(r.rating)) throw new Error(`line ${i + 1}: call.rating must be one of ${RATINGS.join(', ')}`);
      if (!num(r.horizon_days) || r.horizon_days <= 0) throw new Error(`line ${i + 1}: call.horizon_days must be a positive number`);
      if (seen.has(r.call_id)) throw new Error(`line ${i + 1}: duplicate call_id ${r.call_id} (the journal is append-only; a second call is a new call_id)`);
      seen.add(r.call_id);
      calls.push({ ...r, signal_mix: Array.isArray(r.signal_mix) ? r.signal_mix.filter(text) : [], chain_role: r.chain_role ?? null, evidence: r.evidence ?? null, source: r.source ?? 'unknown' });
    } else if (r.kind === 'event') {
      if (!text(r.call_id) || !isoInstant(r.ts_utc)) throw new Error(`line ${i + 1}: event.call_id and ts_utc are required`);
      if (r.event !== 'manual_close') throw new Error(`line ${i + 1}: event must be manual_close (automatic closes live in the scorecard, not the journal)`);
      events.push(r);
    } else throw new Error(`line ${i + 1}: unknown kind ${JSON.stringify(r.kind)}`);
  });
  return { calls, events };
}

export function weekOfMonday(iso: string): string {
  const t = new Date(iso); const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const ACTION: Record<Rating, DecisionAction> = { strong_buy: 'adopt', buy: 'adopt', add: 'adopt', hold: 'shadow', trim: 'reject', sell: 'reject' };
export const thesisTitle = (callId: string) => `[hiphon-pm] ${callId}`;
export const cardIdFor = (callId: string) => `hiphon:${callId}`;

export function mapCall(c: HiphonCall): { thesis: CreateThesisInput; decision: Omit<DecisionInput, 'thesis_id'> } {
  const stop = num(c.stop_price) ? `止损 ${c.stop_price}（${c.stop_pct}%）` : `止损 ${c.stop_pct}%`;
  const body = [`${c.name} ${c.ticker}（${c.market}）· ${c.rating} · 记录于 ${c.ts_utc}`, c.thesis,
    `signals: ${c.signal_mix.join(', ') || '—'}; chain_role: ${c.chain_role ?? '—'}; evidence: ${c.evidence ?? '—'}; entry_basis: ${c.entry_basis}; entry_ref: ${c.entry_price_ref}; size_pct: ${c.size_pct}`,
    '历史战绩映射（WP-A10）：原始记录在 hiphon-pm 日志，只追加不改写。'].join('\n');
  return {
    thesis: { title: thesisTitle(c.call_id), body, invalidation_conditions: [stop], watch_metrics: [`目标 +${c.target_pct}%`, `持有上限 ${c.horizon_days} 个交易日`], next_review_at: c.ts_utc.slice(0, 10), opportunity_type: 'other', horizon_weeks: [Math.max(1, Math.ceil(c.horizon_days / 5))] } as CreateThesisInput,
    decision: { week_of: weekOfMonday(c.ts_utc), arm: 'human_baseline', action: ACTION[c.rating], reason: c.thesis, card_id: cardIdFor(c.call_id), frozen_at: c.ts_utc, cited_judgment_ids: [] },
  };
}

export interface CallsSummary { calls: number; events: number; by_rating: Record<string, number>; by_market: Record<string, number> }
export function summarizeCalls(calls: HiphonCall[], events: HiphonEvent[]): CallsSummary {
  const count = (key: (c: HiphonCall) => string) => calls.reduce<Record<string, number>>((m, c) => { m[key(c)] = (m[key(c)] ?? 0) + 1; return m; }, {});
  return { calls: calls.length, events: events.length, by_rating: count(c => c.rating), by_market: count(c => c.market) };
}
/** The scorecard only aggregates; we can check totals and per-rating closed counts, never per-call verdicts. */
export function compareWithScorecard(summary: CallsSummary, scorecard: Scorecard | null): { consistent: boolean | null; differences: string[] } {
  if (!scorecard) return { consistent: null, differences: ['no scorecard supplied'] };
  const differences: string[] = [];
  const total = (scorecard.closed?.n ?? 0) + (scorecard.open?.n ?? 0);
  if (total !== summary.calls) differences.push(`total: scorecard closed+open=${total}, journal calls=${summary.calls}`);
  for (const [rating, v] of Object.entries(scorecard.closed?.by_rating ?? {})) if ((summary.by_rating[rating] ?? 0) < v.n) differences.push(`rating ${rating}: scorecard closed n=${v.n} exceeds journal calls ${summary.by_rating[rating] ?? 0}`);
  return { consistent: differences.length === 0, differences };
}

export const outcomeEvaluationId = (e: HiphonEvent) => `hiphon-journal:${e.call_id}:${e.ts_utc}`;
export interface ImportDeps {
  theses: { find: (title: string) => Promise<string | null>; create: (input: CreateThesisInput) => Promise<string> };
  ledger: {
    /** card_id (hiphon:<call_id>) → decision id for decisions already in the ledger. */
    existingDecisions: () => Promise<Map<string, string>>;
    /** evaluation_id values of outcomes already recorded, so an interrupted import can resume without duplicates. */
    existingOutcomeEvaluationIds: () => Promise<Set<string>>;
    recordDecision: (input: DecisionInput) => Promise<{ id: string; created_at: string }>;
    recordOutcome: (input: OutcomeInput) => Promise<{ id: string; judged_at: string }>;
  };
}
export interface ImportResult { calls: number; events: number; planned: number; outcomes_planned: number; imported: number; skipped: number; theses_created: number; outcomes: number; outcomes_unmatched: string[]; summary: CallsSummary; scorecard: ReturnType<typeof compareWithScorecard> }

export async function importCalls({ journal, scorecard, dryRun, theses, ledger }: { journal: string; scorecard: Scorecard | null; dryRun: boolean } & ImportDeps): Promise<ImportResult> {
  const { calls, events } = parseCallsJournal(journal);
  const summary = summarizeCalls(calls, events);
  const decisionIds = new Map(await ledger.existingDecisions());
  const plannedCalls = new Set<string>();
  const outcomesDone = new Set(await ledger.existingOutcomeEvaluationIds());
  const result: ImportResult = { calls: calls.length, events: events.length, planned: 0, outcomes_planned: 0, imported: 0, skipped: 0, theses_created: 0, outcomes: 0, outcomes_unmatched: [], summary, scorecard: compareWithScorecard(summary, scorecard) };
  for (const c of calls) {
    const cardId = cardIdFor(c.call_id);
    if (decisionIds.has(cardId)) { result.skipped++; continue; }
    result.planned++;
    if (dryRun) { plannedCalls.add(cardId); continue; }
    const m = mapCall(c);
    let thesisId = await theses.find(m.thesis.title);
    if (!thesisId) { thesisId = await theses.create(m.thesis); result.theses_created++; }
    const made = await ledger.recordDecision({ ...m.decision, thesis_id: thesisId });
    decisionIds.set(cardId, made.id); result.imported++;
  }
  // Outcomes resolve against every known decision (this run or earlier ones) and are keyed by evaluation_id,
  // so a retry after a partial failure completes the missing ones without duplicating the successful ones.
  for (const e of events) {
    const decisionId = decisionIds.get(cardIdFor(e.call_id));
    const call = calls.find(c => c.call_id === e.call_id);
    if ((!decisionId && !plannedCalls.has(cardIdFor(e.call_id))) || !call) { result.outcomes_unmatched.push(e.call_id); continue; }
    const evaluationId = outcomeEvaluationId(e);
    if (outcomesDone.has(evaluationId)) continue;
    result.outcomes_planned++;
    if (dryRun) { outcomesDone.add(evaluationId); continue; }
    await ledger.recordOutcome({ decision_id: decisionId!, window_weeks: Math.max(1, Math.ceil(call.horizon_days / 5)), evaluation_id: evaluationId, price_result: { state: 'closed', reason: 'manual', closed_at: e.ts_utc, note: e.note ?? null, ref_call_id: e.ref_call_id ?? null }, judged_by: 'hiphon-pm-journal' });
    outcomesDone.add(evaluationId); result.outcomes++;
  }
  return result;
}
