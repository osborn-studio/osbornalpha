// Supabase I/O for the decision layer. All calls run as the signed-in user
// (RLS enforced). recalcPositions is the single write-path for positions:
// after every trade insert we recompute that ticker from full trade history.

import { getServerSupabase } from '@/lib/supabase/server';
import type { Decision, DecisionStatus, Position, Trade } from '@/lib/supabase/database.types';
import { computePositions } from './positions';
import type { DecisionInput, TradeInput } from './validate';

// PostgREST serializes Postgres `numeric` as JSON strings; coerce at the read
// boundary so the position engine always does real arithmetic.
export function coerceTradeRow(row: Record<string, unknown>): Trade {
  const r = row as unknown as Trade;
  return { ...r, price: Number(r.price), quantity: Number(r.quantity), fee: Number(r.fee) };
}

export function coercePositionRow(row: Record<string, unknown>): Position {
  const r = row as unknown as Position;
  return { ...r, shares: Number(r.shares), avg_cost: Number(r.avg_cost), realized_pnl: Number(r.realized_pnl) };
}

export function coerceDecisionRow(row: Record<string, unknown>): Decision {
  const r = row as unknown as Decision;
  return {
    ...r,
    entry_low: r.entry_low === null ? null : Number(r.entry_low),
    entry_high: r.entry_high === null ? null : Number(r.entry_high),
    target_price: r.target_price === null ? null : Number(r.target_price),
    stop_loss: r.stop_loss === null ? null : Number(r.stop_loss),
  };
}

async function requireUser() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('not authenticated');
  return { supabase, userId: data.user.id };
}

export async function listDecisions(opts: { ticker?: string; status?: DecisionStatus } = {}): Promise<Decision[]> {
  const { supabase, userId } = await requireUser();
  let q = supabase.from('decisions').select('*').eq('user_id', userId).order('decided_at', { ascending: false }).limit(200);
  if (opts.ticker) q = q.eq('ticker', opts.ticker.trim().toUpperCase()); // writes store tickers uppercased (validate.ts)
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(coerceDecisionRow);
}

export async function createDecision(input: DecisionInput): Promise<Decision> {
  const { supabase, userId } = await requireUser();
  // Adoption link: the recommendation must be the caller's and still open.
  // RLS already hides other users' rows, so "not found" covers both cases.
  if (input.recommendation_id) {
    const { data: rec, error: rErr } = await supabase
      .from('recommendations').select('id, withdrawn_at, ticker, market').eq('id', input.recommendation_id).eq('user_id', userId).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!rec) throw new Error('recommendation not found');
    if ((rec as { withdrawn_at: string | null }).withdrawn_at) throw new Error('recommendation withdrawn');
    if ((rec as { ticker: string }).ticker !== input.ticker) throw new Error('recommendation ticker mismatch');
    if ((rec as { market: string }).market !== input.market) throw new Error('recommendation market mismatch');
  }
  const { data, error } = await (supabase as any)
    .from('decisions')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return coerceDecisionRow(data);
}

// Ids of the caller's withdrawn recommendations (small set; the decision log marks adopted-then-withdrawn rows).
export async function listWithdrawnRecommendationIds(): Promise<string[]> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('recommendations').select('id').eq('user_id', userId).not('withdrawn_at', 'is', null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

export async function updateDecisionStatus(id: string, status: DecisionStatus): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await (supabase as any).from('decisions').update({ status }).eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function listTrades(ticker?: string): Promise<Trade[]> {
  const { supabase, userId } = await requireUser();
  let q = supabase.from('trades').select('*').eq('user_id', userId).order('executed_at', { ascending: false }).limit(500);
  if (ticker) q = q.eq('ticker', ticker.trim().toUpperCase()); // writes store tickers uppercased (validate.ts)
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(coerceTradeRow);
}

export async function createTrade(input: TradeInput): Promise<Trade> {
  const { supabase, userId } = await requireUser();

  // Pre-check oversell against current trade history before writing anything.
  // Known TOCTOU window: two concurrent sells could both pass this pre-check.
  // Accepted at personal-investor scale; recalcPositions will throw on the
  // corrupted history at the next write, surfacing the conflict.
  const { data: history, error: hErr } = await supabase
    .from('trades').select('*').eq('user_id', userId).eq('ticker', input.ticker);
  if (hErr) throw new Error(hErr.message);
  const candidate = {
    ticker: input.ticker,
    direction: input.direction,
    price: input.price,
    quantity: input.quantity,
    fee: input.fee,
    currency: input.currency,
    executed_at: input.executed_at ?? new Date().toISOString(),
  };
  const priorTrades = ((history ?? []) as Record<string, unknown>[]).map(coerceTradeRow);
  computePositions([...priorTrades, candidate]); // throws on oversell

  const { data, error } = await (supabase as any)
    .from('trades')
    .insert({ ...input, executed_at: candidate.executed_at, user_id: userId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const trade = coerceTradeRow(data);

  await recalcPositions(trade.ticker);
  if (trade.decision_id) {
    const { error: dErr } = await (supabase as any).from('decisions').update({ status: 'executed' })
      .eq('id', trade.decision_id).eq('user_id', userId).eq('status', 'open');
    // Deliberately non-fatal: the trade is the source of truth; a stale 'open'
    // status is visible and correctable in the UI.
    if (dErr) console.warn('decision auto-execute failed:', dErr.message);
  }
  return trade;
}

export async function deleteTrade(id: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { data: t, error: getErr } = await supabase
    .from('trades').select('*').eq('id', id).eq('user_id', userId).single();
  if (getErr || !t) throw new Error('trade not found');
  const trade = coerceTradeRow(t as Record<string, unknown>);

  // Pre-check: removing this trade must leave a valid history (deleting a buy
  // that funds a later sell would make the remainder oversold) — throws before
  // any write so the caller can 400 cleanly.
  const { data: history, error: hErr } = await supabase
    .from('trades').select('*').eq('user_id', userId).eq('ticker', trade.ticker);
  if (hErr) throw new Error(hErr.message);
  const remaining = ((history ?? []) as Record<string, unknown>[])
    .map(coerceTradeRow)
    .filter((x) => x.id !== id);
  computePositions(remaining); // throws on oversell

  const { error: delErr } = await (supabase as any)
    .from('trades').delete().eq('id', id).eq('user_id', userId);
  if (delErr) throw new Error(delErr.message);
  await recalcPositions(trade.ticker);
}

export async function recalcPositions(ticker: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('trades').select('*').eq('user_id', userId).eq('ticker', ticker);
  if (error) throw new Error(error.message);
  const [pos] = computePositions(((data ?? []) as Record<string, unknown>[]).map(coerceTradeRow));
  if (!pos) {
    // No trades left for this ticker (e.g. last one deleted) — drop the stale
    // derived row instead of leaving a ghost position behind.
    const { error: rmErr } = await (supabase as any)
      .from('positions').delete().eq('user_id', userId).eq('ticker', ticker);
    if (rmErr) throw new Error(rmErr.message);
    return;
  }
  const row: Position = {
    user_id: userId,
    ticker,
    shares: pos.shares,
    avg_cost: pos.avgCost,
    realized_pnl: pos.realizedPnl,
    currency: pos.currency,
    opened_at: pos.openedAt,
    closed_at: pos.closedAt,
  };
  const { error: upErr } = await (supabase as any).from('positions').upsert(row, { onConflict: 'user_id,ticker' });
  if (upErr) throw new Error(upErr.message);
}

export async function getPortfolio(): Promise<{ positions: Position[]; totals: { realized_pnl: number; open_count: number } }> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('positions').select('*').eq('user_id', userId);
  if (error) throw new Error(error.message);
  const positions = ((data ?? []) as Record<string, unknown>[]).map(coercePositionRow);
  return {
    positions,
    totals: {
      realized_pnl: positions.reduce((s, p) => s + p.realized_pnl, 0),
      open_count: positions.filter((p) => p.shares > 0).length,
    },
  };
}
