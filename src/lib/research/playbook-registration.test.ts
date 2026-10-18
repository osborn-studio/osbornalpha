import { describe, it, expect } from 'vitest';
import {
  buildRegistrationCandidates, clampRationale, companyIdsFor, confidenceFromMemo, findDuplicateItem, horizonFromWeeks,
  isRegistrable, parseRegisterBody, registrationDefaults, splitRegistration,
  type ExistingPlaybookRecommendation, type RegisterItem, type SecurityRow,
} from './playbook-registration';
import type { Entity, InvestmentMemo, PlaybookRun, Thesis } from './types';

const run = (o: Partial<PlaybookRun> = {}): PlaybookRun => ({
  id: 'run-1', memo_id: null, thesis_id: 'th-1', proposed_action: 'PAPER_TRADE', rationale: '算力缺口持续',
  risks: [], approval_status: 'APPROVED', human_decision: 'ok', review_at: '2026-06-03T02:00:00Z', created_at: '2026-06-01T00:00:00Z', ...o,
});
const thesis = (o: Partial<Thesis> = {}): Thesis => ({
  id: 'th-1', title: 'AI 算力', body: '', company_ids: ['e-a', 'e-b'], theme_ids: [], supporting_evidence_ids: [],
  invalidation_conditions: ['x'], watch_metrics: ['y'], status: 'ACTIVE', created_at: 'c', updated_at: 'u', horizon_weeks: [4, 13, 26], ...o,
});
const memo = (o: Partial<InvestmentMemo> = {}): InvestmentMemo => ({
  id: 'm-1', title: 'memo', company_ids: ['e-b', 'e-c'], theme_ids: [], one_line_conclusion: '', thesis: '', supporting_evidence: [],
  counter_arguments: [], key_variables: [], invalidation_conditions: [], open_questions: [], related_impacts: [], confidence: 'HIGH',
  axiom_check_results: [], provenance: { model: 'claude-x' }, status: 'REVIEWED', created_at: 'c', updated_at: 'u', ...o,
});
const entity = (id: string, o: Partial<Entity> = {}): Entity => ({
  id, type: 'COMPANY', name: `公司${id}`, aliases: [], ticker: null, description: null, metadata: {}, created_at: 'c', updated_at: 'u', ...o,
});
const sec = (entity_id: string, exchange_code: string, market: string, o: Partial<SecurityRow> = {}): SecurityRow =>
  ({ entity_id, exchange_code, market, is_primary: true, valid_to: null, ...o });

describe('companyIdsFor', () => {
  it('puts thesis companies first and appends memo companies without duplicates', () => {
    expect(companyIdsFor(thesis(), memo())).toEqual(['e-a', 'e-b', 'e-c']);
  });
  it('works with only a memo or nothing', () => {
    expect(companyIdsFor(null, memo())).toEqual(['e-b', 'e-c']);
    expect(companyIdsFor(null, null)).toEqual([]);
  });
});

describe('buildRegistrationCandidates — ticker resolution', () => {
  it('prefers the primary, open security row', () => {
    const c = buildRegistrationCandidates([entity('e-a')], ['e-a'], [sec('e-a', '600519.SH', 'A')], []);
    expect(c[0]).toMatchObject({ entity_id: 'e-a', ticker: '600519.SH', market: 'A', ticker_source: 'security', supported: true, selected: true });
  });
  it('ignores non-primary or closed security rows', () => {
    const c = buildRegistrationCandidates([entity('e-a')], ['e-a'], [sec('e-a', '600519.SH', 'A', { is_primary: false }), sec('e-a', '000001.SZ', 'A', { valid_to: '2025-01-01' })], []);
    expect(c[0].ticker_source).toBe('none');
    expect(c[0].supported).toBe(false);
    expect(c[0].selected).toBe(false);
  });
  it('falls back to entities.ticker and infers the market', () => {
    const c = buildRegistrationCandidates([entity('e-a', { ticker: '0700.hk' })], ['e-a'], [], []);
    expect(c[0]).toMatchObject({ ticker: '00700.HK', market: 'HK', ticker_source: 'entity', supported: true, selected: false });
  });
  it('normalizes a short HK entity ticker and a short HK security code', () => {
    const fromEntity = buildRegistrationCandidates([entity('e-a', { ticker: '0268.hk' })], ['e-a'], [], []);
    expect(fromEntity[0]).toMatchObject({ ticker: '00268.HK', market: 'HK', selected: false });
    const fromSecurity = buildRegistrationCandidates([entity('e-a')], ['e-a'], [sec('e-a', '268', 'HK')], []);
    expect(fromSecurity[0]).toMatchObject({ ticker: '00268.HK', market: 'HK', ticker_source: 'security', selected: true });
  });
  it('picks the primary security deterministically (lowest exchange_code) regardless of input order', () => {
    const a = sec('e-a', '600519.SH', 'A');
    const b = sec('e-a', '000001.SZ', 'A');
    expect(buildRegistrationCandidates([entity('e-a')], ['e-a'], [a, b], [])[0].ticker).toBe('000001.SZ');
    expect(buildRegistrationCandidates([entity('e-a')], ['e-a'], [b, a], [])[0].ticker).toBe('000001.SZ');
  });
  it('does not fall back to the entity ticker after an unsupported primary security', () => {
    const c = buildRegistrationCandidates([entity('e-a', { ticker: 'AAPL' })], ['e-a'], [sec('e-a', 'XYZ', 'other')], []);
    expect(c[0]).toMatchObject({ ticker: null, ticker_source: 'none', supported: false });
  });
  it('marks market=other and unparseable tickers as unsupported', () => {
    const c = buildRegistrationCandidates([entity('e-a', { ticker: '7203.T' }), entity('e-b')], ['e-a', 'e-b'], [sec('e-b', 'XYZ', 'other')], []);
    expect(c.map((x) => x.supported)).toEqual([false, false]);
    expect(c.map((x) => x.ticker)).toEqual([null, null]);
  });
  it('keeps companyIds order (thesis then memo) and drops unknown ids', () => {
    const c = buildRegistrationCandidates([entity('e-c', { name: 'Zeta' }), entity('e-b', { name: 'Alpha' }), entity('e-a', { name: 'Mid' })], ['e-a', 'e-c', 'e-b', 'ghost'], [], []);
    expect(c.map((x) => x.entity_id)).toEqual(['e-a', 'e-c', 'e-b']);
  });
  it('marks already registered companies and deselects them', () => {
    const existing: ExistingPlaybookRecommendation[] = [{ id: 'r-9', ticker: '600519.SH', market: 'A', entity_id: 'e-a' }];
    const c = buildRegistrationCandidates([entity('e-a')], ['e-a'], [sec('e-a', '600519.SH', 'A')], existing);
    expect(c[0].registered_recommendation_id).toBe('r-9');
    expect(c[0].selected).toBe(false);
  });
});

describe('defaults', () => {
  it('maps memo confidence to 30/60/85 and defaults to 50', () => {
    expect(confidenceFromMemo('LOW')).toBe(30);
    expect(confidenceFromMemo('MEDIUM')).toBe(60);
    expect(confidenceFromMemo('HIGH')).toBe(85);
    expect(confidenceFromMemo(undefined)).toBe(50);
  });
  it('maps the longest thesis horizon in weeks to short/mid/long', () => {
    expect(horizonFromWeeks([2, 8])).toBe('short');
    expect(horizonFromWeeks([4, 13, 26])).toBe('mid');
    expect(horizonFromWeeks([52])).toBe('long');
    expect(horizonFromWeeks(undefined)).toBeNull();
    expect(horizonFromWeeks([])).toBeNull();
  });
  it('builds defaults from run + thesis + memo', () => {
    expect(registrationDefaults(run(), thesis(), memo())).toEqual({
      action: 'buy', confidence: 85, horizon: 'mid', recommended_at: '2026-06-03T02:00:00Z', rationale: '算力缺口持续', thesis_ref: 'th-1',
    });
  });
  it('falls back to created_at when review_at is missing and to 50/null without memo/thesis', () => {
    expect(registrationDefaults(run({ review_at: null, thesis_id: null }), null, null)).toEqual({
      action: 'buy', confidence: 50, horizon: null, recommended_at: '2026-06-01T00:00:00Z', rationale: '算力缺口持续', thesis_ref: null,
    });
  });
});

describe('defaults — recommended_at clamp', () => {
  it('clamps a future review_at to now', () => {
    expect(registrationDefaults(run({ review_at: '2030-01-01T00:00:00Z' }), null, null, '2026-10-18T00:00:00Z').recommended_at).toBe('2026-10-18T00:00:00Z');
  });
  it('keeps a past review_at', () => {
    expect(registrationDefaults(run(), null, null, '2026-10-18T00:00:00Z').recommended_at).toBe('2026-06-03T02:00:00Z');
  });
});

describe('clampRationale', () => {
  it('leaves a 4000-unit string unchanged', () => {
    const s = 'a'.repeat(4000);
    expect(clampRationale(s)).toBe(s);
  });
  it('clips a 4001-unit string to 4000', () => {
    expect(clampRationale('a'.repeat(4001))).toHaveLength(4000);
  });
  it('does not split a surrogate pair at the boundary', () => {
    const out = clampRationale('a'.repeat(3999) + '😀');
    expect(out).toBe('a'.repeat(3999));
  });
});

describe('isRegistrable', () => {
  it('requires PAPER_TRADE and APPROVED', () => {
    expect(isRegistrable(run())).toBe(true);
    expect(isRegistrable(run({ approval_status: 'PENDING' }))).toBe(false);
    expect(isRegistrable(run({ proposed_action: 'WATCHLIST' }))).toBe(false);
  });
});

describe('parseRegisterBody', () => {
  const item = { entity_id: 'e-a', ticker: '600519.SH', market: 'A', action: 'buy' };
  it('accepts 1-20 items and optional shared fields', () => {
    const r = parseRegisterBody({ items: [item], rationale: 'r', recommended_at: '2026-06-03T02:00:00Z' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toHaveLength(1);
    expect(r.value.items[0]).toMatchObject({ entity_id: 'e-a', ticker: '600519.SH', market: 'A', action: 'buy' });
    expect(r.value.rationale).toBe('r');
  });
  it('rejects empty, too many, bad market/action, bad entity_id and non-object items', () => {
    expect(parseRegisterBody({ items: [] })).toEqual({ ok: false, error: 'items must have 1-20 entries' });
    expect(parseRegisterBody({ items: Array.from({ length: 21 }, () => item) })).toEqual({ ok: false, error: 'items must have 1-20 entries' });
    expect(parseRegisterBody({ items: [{ ...item, market: 'JP' }] })).toEqual({ ok: false, error: 'items[0].market must be A|HK|US' });
    expect(parseRegisterBody({ items: [{ ...item, action: 'short' }] })).toEqual({ ok: false, error: 'items[0].action must be one of buy|sell|trim|add|hold|pass' });
    expect(parseRegisterBody({ items: [{ ...item, entity_id: 42 }] })).toEqual({ ok: false, error: 'items[0].entity_id must be a string or null' });
    expect(parseRegisterBody({ items: ['x'] })).toEqual({ ok: false, error: 'items[0] must be an object' });
  });
  it('treats missing entity_id as null and drops non-numeric optionals', () => {
    const r = parseRegisterBody({ items: [{ ticker: 'NVDA', market: 'US', action: 'sell', confidence: 'high', target_price: 'x' }] });
    expect(r.ok && r.value.items[0]).toMatchObject({ entity_id: null, confidence: undefined, target_price: undefined });
  });
});

describe('findDuplicateItem', () => {
  it('returns the index of the first item repeating an earlier ticker+market', () => {
    const items: RegisterItem[] = [
      { entity_id: null, ticker: 'NVDA', market: 'US', action: 'buy' },
      { entity_id: null, ticker: '600519.SH', market: 'A', action: 'buy' },
      { entity_id: 'e-x', ticker: 'NVDA', market: 'US', action: 'sell' },
    ];
    expect(findDuplicateItem(items)).toBe(2);
    expect(findDuplicateItem(items.slice(0, 2))).toBeNull();
  });
});

describe('splitRegistration', () => {
  const existing: ExistingPlaybookRecommendation[] = [
    { id: 'r-1', ticker: '600519.SH', market: 'A', entity_id: 'e-a' },
    { id: 'r-2', ticker: 'NVDA', market: 'US', entity_id: null },
  ];
  it('skips entity matches and manual ticker+market matches, keeps the rest', () => {
    const items: RegisterItem[] = [
      { entity_id: 'e-a', ticker: '600519.SH', market: 'A', action: 'buy' },
      { entity_id: null, ticker: 'NVDA', market: 'US', action: 'buy' },
      { entity_id: 'e-b', ticker: '00700.HK', market: 'HK', action: 'buy' },
    ];
    const r = splitRegistration(items, existing);
    expect(r.toCreate.map((i) => i.ticker)).toEqual(['00700.HK']);
    expect(r.skipped).toEqual([
      { entity_id: 'e-a', ticker: '600519.SH', reason: 'already_registered' },
      { entity_id: null, ticker: 'NVDA', reason: 'already_registered' },
    ]);
  });
  it('does not skip an entity-less item just because an entity row has the same ticker', () => {
    const r = splitRegistration([{ entity_id: 'e-z', ticker: '600519.SH', market: 'A', action: 'buy' }], existing);
    expect(r.toCreate).toHaveLength(1);
  });
});
