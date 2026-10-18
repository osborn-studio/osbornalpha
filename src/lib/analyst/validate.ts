// Request validation for the analyst layer. Dependency-free (no fetch, no
// Supabase) so the node-env vitest covers it. Mirrors portfolio/validate.ts.

import type { AnalystKind, DecisionAction, DecisionHorizon, Market, RecommendationSource } from '@/lib/supabase/database.types';
import { isUuid, type Parsed } from '@/lib/portfolio/validate';
import { normalizeSecurityTicker } from '@/lib/securities/normalize';
import type { CoreMarket } from '@/lib/securities/model';

const KINDS: AnalystKind[] = ['human', 'agent'];
const MARKETS: Market[] = ['A', 'HK', 'US'];
const ACTIONS: DecisionAction[] = ['buy', 'sell', 'trim', 'add', 'hold', 'pass'];
const HORIZONS: DecisionHorizon[] = ['short', 'mid', 'long'];
const SOURCES: RecommendationSource[] = ['manual', 'copilot', 'playbook', 'signal', 'import'];

const MAX_NAME = 60;
const MAX_TICKER = 20;
const MAX_TEXT = 4000;
const MAX_THESIS_REF = 200;
const MAX_SOURCE_REF_BYTES = 16384;

function optionalString(v: unknown, max: number, field: string): Parsed<string | undefined> {
  if (typeof v !== 'string') return { ok: true, value: undefined };
  if (v.length > max) return { ok: false, error: `${field} too long (max ${max})` };
  return { ok: true, value: v };
}

function num(b: Record<string, unknown>, k: string): number | undefined {
  return typeof b[k] === 'number' && Number.isFinite(b[k] as number) ? (b[k] as number) : undefined;
}

export interface ProfileInput { display_name: string; kind: AnalystKind; note?: string }

export function parseProfileInput(body: unknown): Parsed<ProfileInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.display_name !== 'string' || !b.display_name.trim()) return { ok: false, error: 'display_name required' };
  const display_name = b.display_name.trim();
  if (display_name.length > MAX_NAME) return { ok: false, error: `display_name too long (max ${MAX_NAME})` };
  if (b.kind !== undefined && !KINDS.includes(b.kind as AnalystKind)) return { ok: false, error: 'kind must be human|agent' };
  const note = optionalString(b.note, MAX_TEXT, 'note');
  if (!note.ok) return note;
  return { ok: true, value: { display_name, kind: (b.kind as AnalystKind | undefined) ?? 'human', note: note.value } };
}

export interface ProfilePatch { display_name?: string; note?: string | null; archived?: boolean }

export function parseProfilePatch(body: unknown): Parsed<ProfilePatch> {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: ProfilePatch = {};
  if (b.display_name !== undefined) {
    if (typeof b.display_name !== 'string' || !b.display_name.trim()) return { ok: false, error: 'display_name required' };
    const display_name = b.display_name.trim();
    if (display_name.length > MAX_NAME) return { ok: false, error: `display_name too long (max ${MAX_NAME})` };
    patch.display_name = display_name;
  }
  if (b.note !== undefined) {
    if (b.note === null) patch.note = null;
    else {
      const note = optionalString(b.note, MAX_TEXT, 'note');
      if (!note.ok) return note;
      if (note.value !== undefined) patch.note = note.value;
    }
  }
  if (b.archived !== undefined) {
    if (typeof b.archived !== 'boolean') return { ok: false, error: 'archived must be boolean' };
    patch.archived = b.archived;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'nothing to update' };
  return { ok: true, value: patch };
}

export interface RecommendationInput {
  analyst_id: string;
  ticker: string;
  market: Market;
  action: DecisionAction;
  reference_price?: number;
  rationale?: string;
  confidence?: number;
  target_price?: number;
  stop_loss?: number;
  horizon?: DecisionHorizon;
  thesis_ref?: string;
  source_type: RecommendationSource;
  source_ref?: Record<string, unknown>;
  recommended_at?: string;
}

export function parseRecommendationInput(body: unknown): Parsed<RecommendationInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isUuid(b.analyst_id)) return { ok: false, error: 'analyst_id must be a uuid' };
  if (typeof b.ticker !== 'string' || !b.ticker.trim()) return { ok: false, error: 'ticker required' };
  const rawTicker = b.ticker.trim();
  if (rawTicker.length > MAX_TICKER) return { ok: false, error: `ticker too long (max ${MAX_TICKER})` };
  if (!MARKETS.includes(b.market as Market)) return { ok: false, error: 'market must be A|HK|US' };
  if (!ACTIONS.includes(b.action as DecisionAction)) return { ok: false, error: `action must be one of ${ACTIONS.join('|')}` };
  const ticker = normalizeSecurityTicker(rawTicker, b.market as CoreMarket);
  if (!ticker) return { ok: false, error: 'ticker not valid for market' };
  const reference_price = num(b, 'reference_price');
  if (b.reference_price !== undefined && !(reference_price !== undefined && reference_price > 0)) return { ok: false, error: 'reference_price must be > 0' };
  const confidence = num(b, 'confidence');
  if (confidence !== undefined && (!Number.isInteger(confidence) || confidence < 0 || confidence > 100)) return { ok: false, error: 'confidence must be an integer 0-100' };
  const rationale = optionalString(b.rationale, MAX_TEXT, 'rationale');
  if (!rationale.ok) return rationale;
  const thesis_ref = optionalString(b.thesis_ref, MAX_THESIS_REF, 'thesis_ref');
  if (!thesis_ref.ok) return thesis_ref;
  let recommended_at: string | undefined;
  if (b.recommended_at !== undefined && b.recommended_at !== null && typeof b.recommended_at !== 'string') return { ok: false, error: 'recommended_at must be a string' };
  if (typeof b.recommended_at === 'string') {
    const ms = Date.parse(b.recommended_at);
    if (isNaN(ms)) return { ok: false, error: 'recommended_at must be a valid date string' };
    // A bare date parses as UTC midnight, which is the previous trading day in New York.
    // A time without a zone (e.g. 2026-06-03T09:30) parses as server-local time; the UI always sends an ISO string with Z, so only direct API callers are affected.
    if (!/T\d{2}:\d{2}/.test(b.recommended_at)) return { ok: false, error: 'recommended_at must include a time' };
    if (ms > Date.now() + 60_000) return { ok: false, error: 'recommended_at must not be in the future' };
    recommended_at = new Date(ms).toISOString();
  }
  const source_ref =
    typeof b.source_ref === 'object' && b.source_ref !== null && !Array.isArray(b.source_ref)
      ? (b.source_ref as Record<string, unknown>)
      : undefined;
  if (source_ref !== undefined && JSON.stringify(source_ref).length > MAX_SOURCE_REF_BYTES) {
    return { ok: false, error: 'source_ref too large (max 16KB)' };
  }
  return {
    ok: true,
    value: {
      analyst_id: b.analyst_id,
      ticker,
      market: b.market as Market,
      action: b.action as DecisionAction,
      reference_price,
      rationale: rationale.value,
      confidence,
      target_price: num(b, 'target_price'),
      stop_loss: num(b, 'stop_loss'),
      horizon: HORIZONS.includes(b.horizon as DecisionHorizon) ? (b.horizon as DecisionHorizon) : undefined,
      thesis_ref: thesis_ref.value,
      source_type: SOURCES.includes(b.source_type as RecommendationSource) ? (b.source_type as RecommendationSource) : 'manual',
      source_ref,
      recommended_at,
    },
  };
}

export interface WithdrawInput { reason?: string }

export function parseWithdrawInput(body: unknown): Parsed<WithdrawInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const reason = optionalString(b.reason, MAX_TEXT, 'reason');
  if (!reason.ok) return reason;
  return { ok: true, value: { reason: reason.value } };
}
