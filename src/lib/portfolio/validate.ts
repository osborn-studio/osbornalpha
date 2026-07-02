// Shared request validation for the decision layer. Used by API routes now
// and by copilot agent tools (P1c) later — keep it dependency-free.

import type { DecisionAction, DecisionHorizon, DecisionSource, Market, TradeDirection } from '@/lib/supabase/database.types';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ACTIONS: DecisionAction[] = ['buy', 'sell', 'trim', 'add', 'hold', 'pass'];
const MARKETS: Market[] = ['A', 'HK', 'US'];
const SOURCES: DecisionSource[] = ['manual', 'copilot', 'signal', 'radar', 'skill'];
const HORIZONS: DecisionHorizon[] = ['short', 'mid', 'long'];

const MAX_TICKER = 20;
const MAX_TEXT = 4000;
const MAX_CURRENCY = 8;
const MAX_SOURCE_REF_BYTES = 16384;

// Required non-blank string, trimmed and capped. Used for ticker.
function requiredTicker(v: unknown): Parsed<string> {
  if (typeof v !== 'string' || !v.trim()) return { ok: false, error: 'ticker required' };
  const t = v.trim();
  if (t.length > MAX_TICKER) return { ok: false, error: `ticker too long (max ${MAX_TICKER})` };
  return { ok: true, value: t.toUpperCase() };
}

// Optional free-text field: non-strings silently drop to undefined; over-long strings error.
function optionalString(v: unknown, max: number, field: string): Parsed<string | undefined> {
  if (typeof v !== 'string') return { ok: true, value: undefined };
  if (v.length > max) return { ok: false, error: `${field} too long (max ${max})` };
  return { ok: true, value: v };
}

// Optional date field: non-strings silently drop to undefined; unparseable strings error.
function optionalDateString(v: unknown, field: string): Parsed<string | undefined> {
  if (typeof v !== 'string') return { ok: true, value: undefined };
  if (isNaN(Date.parse(v))) return { ok: false, error: `${field} must be a valid date string` };
  return { ok: true, value: v };
}

export interface DecisionInput {
  ticker: string;
  market: Market;
  action: DecisionAction;
  thesis?: string;
  confidence?: number;
  entry_low?: number;
  entry_high?: number;
  target_price?: number;
  stop_loss?: number;
  horizon?: DecisionHorizon;
  source_type: DecisionSource;
  source_ref?: Record<string, unknown>;
  expires_at?: string;
}

export function parseDecisionInput(body: unknown): Parsed<DecisionInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const ticker = requiredTicker(b.ticker);
  if (!ticker.ok) return ticker;
  if (!MARKETS.includes(b.market as Market)) return { ok: false, error: 'market must be A|HK|US' };
  if (!ACTIONS.includes(b.action as DecisionAction)) return { ok: false, error: `action must be one of ${ACTIONS.join('|')}` };
  const num = (k: string): number | undefined => (typeof b[k] === 'number' && Number.isFinite(b[k] as number) ? (b[k] as number) : undefined);
  const confidence = num('confidence');
  if (confidence !== undefined && (confidence < 0 || confidence > 100)) return { ok: false, error: 'confidence must be 0-100' };
  const entry_low = num('entry_low');
  const entry_high = num('entry_high');
  if (entry_low !== undefined && entry_high !== undefined && entry_low > entry_high) {
    return { ok: false, error: 'entry_low must be <= entry_high' };
  }
  const thesis = optionalString(b.thesis, MAX_TEXT, 'thesis');
  if (!thesis.ok) return thesis;
  const expires_at = optionalDateString(b.expires_at, 'expires_at');
  if (!expires_at.ok) return expires_at;
  // source_ref must be a plain object; arrays and non-objects silently drop to undefined.
  const source_ref =
    typeof b.source_ref === 'object' && b.source_ref !== null && !Array.isArray(b.source_ref)
      ? (b.source_ref as Record<string, unknown>)
      : undefined;
  if (source_ref !== undefined && JSON.stringify(source_ref).length > MAX_SOURCE_REF_BYTES) {
    return { ok: false, error: 'source_ref too large (max 16KB)' };
  }
  const horizon = HORIZONS.includes(b.horizon as DecisionHorizon) ? (b.horizon as DecisionHorizon) : undefined;
  const source_type = SOURCES.includes(b.source_type as DecisionSource) ? (b.source_type as DecisionSource) : 'manual';
  return {
    ok: true,
    value: {
      ticker: ticker.value,
      market: b.market as Market,
      action: b.action as DecisionAction,
      thesis: thesis.value,
      confidence,
      entry_low,
      entry_high,
      target_price: num('target_price'),
      stop_loss: num('stop_loss'),
      horizon,
      source_type,
      source_ref,
      expires_at: expires_at.value,
    },
  };
}

export interface TradeInput {
  ticker: string;
  direction: TradeDirection;
  price: number;
  quantity: number;
  fee: number;
  currency: string;
  decision_id?: string;
  executed_at?: string;
  note?: string;
}

export function parseTradeInput(body: unknown): Parsed<TradeInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const ticker = requiredTicker(b.ticker);
  if (!ticker.ok) return ticker;
  if (b.direction !== 'buy' && b.direction !== 'sell') return { ok: false, error: 'direction must be buy|sell' };
  if (typeof b.price !== 'number' || !(b.price > 0)) return { ok: false, error: 'price must be > 0' };
  if (typeof b.quantity !== 'number' || !(b.quantity > 0)) return { ok: false, error: 'quantity must be > 0' };
  const fee = typeof b.fee === 'number' && b.fee >= 0 ? b.fee : 0;
  if (typeof b.currency === 'string' && b.currency.length > MAX_CURRENCY) {
    return { ok: false, error: `currency too long (max ${MAX_CURRENCY})` };
  }
  const note = optionalString(b.note, MAX_TEXT, 'note');
  if (!note.ok) return note;
  const executed_at = optionalDateString(b.executed_at, 'executed_at');
  if (!executed_at.ok) return executed_at;
  return {
    ok: true,
    value: {
      ticker: ticker.value,
      direction: b.direction,
      price: b.price,
      quantity: b.quantity,
      fee,
      currency: typeof b.currency === 'string' && b.currency ? b.currency : 'CNY',
      decision_id: typeof b.decision_id === 'string' ? b.decision_id : undefined,
      executed_at: executed_at.value,
      note: note.value,
    },
  };
}
