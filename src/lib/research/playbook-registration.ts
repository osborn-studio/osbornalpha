// Pure rules for registering an approved PAPER_TRADE playbook run as analyst
// recommendations (spec docs/superpowers/specs/2026-10-18-playbook-to-recommendation-design.md).
// No I/O here: the two research routes feed rows in and persist the result.

import type { DecisionAction, DecisionHorizon } from '@/lib/supabase/database.types';
import type { CoreMarket } from '@/lib/securities/model';
import { inferCoreMarket, normalizeSecurityTicker } from '@/lib/securities/ticker';
import type { Confidence, Entity, InvestmentMemo, PlaybookRun, Thesis } from './types';

const CORE_MARKETS: CoreMarket[] = ['A', 'HK', 'US'];
const ACTIONS: DecisionAction[] = ['buy', 'sell', 'trim', 'add', 'hold', 'pass'];
const HORIZONS: DecisionHorizon[] = ['short', 'mid', 'long'];
const MAX_ITEMS = 20;
export const MAX_RATIONALE = 4000;

/** Clip to the analyst validator's limit (UTF-16 units, as String.length counts) without splitting a surrogate pair. */
export function clampRationale(text: string, max = MAX_RATIONALE): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** Subset of research_entity_securities the resolver needs. */
export interface SecurityRow { entity_id: string; exchange_code: string; market: string; is_primary: boolean; valid_to: string | null }

/** An analyst recommendation already created from this run (source_ref.entity_id may be null for manual rows). */
export interface ExistingPlaybookRecommendation { id: string; ticker: string; market: string; entity_id: string | null }

export interface RegistrationCandidate {
  entity_id: string;
  name: string;
  ticker: string | null;
  market: CoreMarket | null;
  ticker_source: 'security' | 'entity' | 'none';
  supported: boolean;
  /** Pre-checked in the form: only curated security rows that are not yet registered. */
  selected: boolean;
  registered_recommendation_id: string | null;
}

export interface RegistrationDefaults {
  action: DecisionAction;
  confidence: number;
  horizon: DecisionHorizon | null;
  recommended_at: string;
  rationale: string;
  thesis_ref: string | null;
}

export interface RegisterItem {
  entity_id: string | null;
  ticker: string;
  market: CoreMarket;
  action: DecisionAction;
  confidence?: number;
  horizon?: DecisionHorizon;
  target_price?: number;
  stop_loss?: number;
}

export interface RegisterBody { items: RegisterItem[]; rationale?: string; recommended_at?: string }

// Mirrors Parsed<T> in src/lib/portfolio/validate.ts; kept local so research does not import portfolio internals.
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function isRegistrable(run: PlaybookRun): boolean {
  return run.proposed_action === 'PAPER_TRADE' && run.approval_status === 'APPROVED';
}

/** Thesis companies first (their order), then memo companies not already present. */
export function companyIdsFor(thesis: Thesis | null, memo: InvestmentMemo | null): string[] {
  const out: string[] = [];
  for (const id of [...(thesis?.company_ids ?? []), ...(memo?.company_ids ?? [])]) if (!out.includes(id)) out.push(id);
  return out;
}

// The curated security row is authoritative, so an unsupported market does not fall back to the free-text entity ticker.
function resolveTicker(entity: Entity, securities: SecurityRow[]): Pick<RegistrationCandidate, 'ticker' | 'market' | 'ticker_source'> {
  const primaries = securities
    .filter((s) => s.entity_id === entity.id && s.is_primary && s.valid_to === null)
    .sort((a, b) => a.exchange_code.localeCompare(b.exchange_code));
  const primary = primaries[0];
  if (primary) {
    const market = CORE_MARKETS.includes(primary.market as CoreMarket) ? (primary.market as CoreMarket) : null;
    const ticker = market ? normalizeSecurityTicker(primary.exchange_code, market) : null;
    return ticker && market ? { ticker, market, ticker_source: 'security' } : { ticker: null, market: null, ticker_source: 'none' };
  }
  if (entity.ticker) {
    const market = inferCoreMarket(entity.ticker);
    const ticker = market ? normalizeSecurityTicker(entity.ticker, market) : null;
    if (ticker && market) return { ticker, market, ticker_source: 'entity' };
  }
  return { ticker: null, market: null, ticker_source: 'none' };
}

/**
 * One candidate per known company id, in companyIdsFor() order (thesis ids first, then memo ids).
 */
export function buildRegistrationCandidates(
  entities: Entity[],
  companyIds: string[],
  securities: SecurityRow[],
  existing: ExistingPlaybookRecommendation[],
): RegistrationCandidate[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const known = companyIds.filter((id) => byId.has(id));
  return known.map((id) => {
    const entity = byId.get(id)!;
    const resolved = resolveTicker(entity, securities);
    const supported = resolved.ticker !== null;
    const registered = existing.find((r) => r.entity_id === id) ?? null;
    return {
      entity_id: id,
      name: entity.name,
      ...resolved,
      supported,
      selected: supported && registered === null && resolved.ticker_source === 'security',
      registered_recommendation_id: registered?.id ?? null,
    };
  });
}

export function confidenceFromMemo(confidence: Confidence | undefined): number {
  if (confidence === 'LOW') return 30;
  if (confidence === 'MEDIUM') return 60;
  if (confidence === 'HIGH') return 85;
  return 50;
}

export function horizonFromWeeks(weeks: number[] | undefined): DecisionHorizon | null {
  if (!weeks || weeks.length === 0) return null;
  const max = Math.max(...weeks);
  return max <= 8 ? 'short' : max <= 26 ? 'mid' : 'long';
}

export function registrationDefaults(
  run: PlaybookRun, thesis: Thesis | null, memo: InvestmentMemo | null, now: string = new Date().toISOString(),
): RegistrationDefaults {
  // review_at is the approval time in the UI flow, but the approve API also accepts a future follow-up date;
  // a recommendation cannot be dated in the future.
  const candidate = run.review_at ?? run.created_at;
  const recommended_at = new Date(candidate).getTime() > new Date(now).getTime() ? now : candidate;
  return {
    action: 'buy',
    confidence: confidenceFromMemo(memo?.confidence),
    horizon: horizonFromWeeks(thesis?.horizon_weeks),
    // The research judgment was made when the run was approved, not when the user clicks register.
    recommended_at,
    rationale: run.rationale,
    thesis_ref: run.thesis_id ?? null,
  };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function parseRegisterBody(body: unknown): Parsed<RegisterBody> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > MAX_ITEMS) return { ok: false, error: `items must have 1-${MAX_ITEMS} entries` };
  const items: RegisterItem[] = [];
  for (let i = 0; i < b.items.length; i++) {
    const raw = b.items[i];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: `items[${i}] must be an object` };
    const it = raw as Record<string, unknown>;
    if (it.entity_id !== undefined && it.entity_id !== null && typeof it.entity_id !== 'string') return { ok: false, error: `items[${i}].entity_id must be a string or null` };
    if (typeof it.ticker !== 'string' || !it.ticker.trim()) return { ok: false, error: `items[${i}].ticker required` };
    if (!CORE_MARKETS.includes(it.market as CoreMarket)) return { ok: false, error: `items[${i}].market must be A|HK|US` };
    if (!ACTIONS.includes(it.action as DecisionAction)) return { ok: false, error: `items[${i}].action must be one of ${ACTIONS.join('|')}` };
    items.push({
      entity_id: typeof it.entity_id === 'string' ? it.entity_id : null,
      ticker: it.ticker.trim().toUpperCase(),
      market: it.market as CoreMarket,
      action: it.action as DecisionAction,
      confidence: num(it.confidence),
      horizon: HORIZONS.includes(it.horizon as DecisionHorizon) ? (it.horizon as DecisionHorizon) : undefined,
      target_price: num(it.target_price),
      stop_loss: num(it.stop_loss),
    });
  }
  if (b.rationale !== undefined && (typeof b.rationale !== 'string' || b.rationale.length > MAX_RATIONALE)) return { ok: false, error: `rationale must be a string up to ${MAX_RATIONALE} chars` };
  if (b.recommended_at !== undefined && typeof b.recommended_at !== 'string') return { ok: false, error: 'recommended_at must be a string' };
  return { ok: true, value: { items, rationale: b.rationale as string | undefined, recommended_at: b.recommended_at as string | undefined } };
}

/** Index of the first item that repeats an earlier (ticker, market), or null. */
export function findDuplicateItem(items: RegisterItem[]): number | null {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const key = `${items[i].market}:${items[i].ticker}`;
    if (seen.has(key)) return i;
    seen.add(key);
  }
  return null;
}

// Duplicate tickers across recommendations are legal; findDuplicateItem only guards within one request.
/** Idempotency: an item is skipped when its entity was already registered from this run, or — for manual rows — the same ticker+market was. */
export function splitRegistration(items: RegisterItem[], existing: ExistingPlaybookRecommendation[]) {
  const toCreate: RegisterItem[] = [];
  const skipped: Array<{ entity_id: string | null; ticker: string; reason: 'already_registered' }> = [];
  for (const item of items) {
    const hit = item.entity_id !== null
      ? existing.some((r) => r.entity_id === item.entity_id)
      : existing.some((r) => r.entity_id === null && r.ticker === item.ticker && r.market === item.market);
    if (hit) skipped.push({ entity_id: item.entity_id, ticker: item.ticker, reason: 'already_registered' });
    else toCreate.push(item);
  }
  return { toCreate, skipped };
}
