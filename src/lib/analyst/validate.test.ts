import { describe, it, expect } from 'vitest';
import { parseProfileInput, parseProfilePatch, parseRecommendationInput, parseWithdrawInput } from './validate';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('parseProfileInput', () => {
  it('accepts a trimmed display name and defaults kind to human', () => {
    const r = parseProfileInput({ display_name: '  张三 ' });
    expect(r).toEqual({ ok: true, value: { display_name: '张三', kind: 'human', note: undefined } });
  });
  it('accepts kind agent and a note', () => {
    const r = parseProfileInput({ display_name: 'John', kind: 'agent', note: 'copilot' });
    expect(r.ok && r.value.kind).toBe('agent');
    expect(r.ok && r.value.note).toBe('copilot');
  });
  it('rejects blank, missing or over-long names', () => {
    expect(parseProfileInput({})).toEqual({ ok: false, error: 'display_name required' });
    expect(parseProfileInput({ display_name: '   ' })).toEqual({ ok: false, error: 'display_name required' });
    expect(parseProfileInput({ display_name: 'x'.repeat(61) })).toEqual({ ok: false, error: 'display_name too long (max 60)' });
  });
  it('rejects an unknown kind', () => {
    expect(parseProfileInput({ display_name: 'a', kind: 'robot' })).toEqual({ ok: false, error: 'kind must be human|agent' });
  });
});

describe('parseProfilePatch', () => {
  it('requires at least one field', () => {
    expect(parseProfilePatch({})).toEqual({ ok: false, error: 'nothing to update' });
  });
  it('accepts rename, note clear and archive flag', () => {
    expect(parseProfilePatch({ display_name: ' 新名 ' })).toEqual({ ok: true, value: { display_name: '新名' } });
    expect(parseProfilePatch({ note: null })).toEqual({ ok: true, value: { note: null } });
    expect(parseProfilePatch({ archived: true })).toEqual({ ok: true, value: { archived: true } });
  });
  it('rejects a non-boolean archived', () => {
    expect(parseProfilePatch({ archived: 'yes' })).toEqual({ ok: false, error: 'archived must be boolean' });
  });
});

describe('parseRecommendationInput', () => {
  const base = { analyst_id: UUID, ticker: '600519.sh', market: 'A', action: 'buy' };

  it('uppercases ticker, defaults source to manual and leaves optionals undefined', () => {
    const r = parseRecommendationInput(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ticker).toBe('600519.SH');
    expect(r.value.source_type).toBe('manual');
    expect(r.value.reference_price).toBeUndefined();
    expect(r.value.recommended_at).toBeUndefined();
  });
  it('rejects a missing or over-long ticker', () => {
    expect(parseRecommendationInput({ analyst_id: UUID, market: 'A', action: 'buy' })).toEqual({ ok: false, error: 'ticker required' });
    expect(parseRecommendationInput({ ...base, ticker: 'x'.repeat(21) })).toEqual({ ok: false, error: 'ticker too long (max 20)' });
  });
  it('stores the canonical ticker for the market', () => {
    const val = (ticker: string, market: string) => {
      const r = parseRecommendationInput({ ...base, ticker, market });
      return r.ok ? r.value.ticker : r;
    };
    expect(val('0700.HK', 'HK')).toBe('00700.HK');
    expect(val('600519', 'A')).toBe('600519.SH');
    expect(val('nvda', 'US')).toBe('NVDA');
    expect(parseRecommendationInput({ ...base, ticker: 'NVDA', market: 'A' })).toEqual({ ok: false, error: 'ticker not valid for market' });
  });
  it('rejects a non-uuid analyst_id', () => {
    expect(parseRecommendationInput({ ...base, analyst_id: 'abc' })).toEqual({ ok: false, error: 'analyst_id must be a uuid' });
  });
  it('rejects markets outside A|HK|US and unknown actions', () => {
    expect(parseRecommendationInput({ ...base, market: 'JP' })).toEqual({ ok: false, error: 'market must be A|HK|US' });
    expect(parseRecommendationInput({ ...base, action: 'short' })).toEqual({ ok: false, error: 'action must be one of buy|sell|trim|add|hold|pass' });
  });
  it('rejects non-positive reference_price and out-of-range confidence', () => {
    expect(parseRecommendationInput({ ...base, reference_price: 0 })).toEqual({ ok: false, error: 'reference_price must be > 0' });
    expect(parseRecommendationInput({ ...base, confidence: 101 })).toEqual({ ok: false, error: 'confidence must be an integer 0-100' });
    expect(parseRecommendationInput({ ...base, confidence: 50.5 })).toEqual({ ok: false, error: 'confidence must be an integer 0-100' });
  });
  it('rejects a future recommended_at and an unparseable one', () => {
    expect(parseRecommendationInput({ ...base, recommended_at: 'yesterday' })).toEqual({ ok: false, error: 'recommended_at must be a valid date string' });
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(parseRecommendationInput({ ...base, recommended_at: future })).toEqual({ ok: false, error: 'recommended_at must not be in the future' });
  });
  it('rejects a non-string recommended_at instead of falling back to now', () => {
    expect(parseRecommendationInput({ ...base, recommended_at: 123 })).toEqual({ ok: false, error: 'recommended_at must be a string' });
  });
  it('rejects a date-only recommended_at (would be read as UTC midnight and shift US calls a day)', () => {
    expect(parseRecommendationInput({ ...base, recommended_at: '2026-06-03' })).toEqual({ ok: false, error: 'recommended_at must include a time' });
    const r = parseRecommendationInput({ ...base, recommended_at: '2026-06-03T09:30:00+08:00' });
    expect(r.ok && r.value.recommended_at).toBe('2026-06-03T01:30:00.000Z');
  });
  it('keeps a known source_type and drops arrays passed as source_ref', () => {
    const r = parseRecommendationInput({ ...base, source_type: 'playbook', source_ref: [1, 2] });
    expect(r.ok && r.value.source_type).toBe('playbook');
    expect(r.ok && r.value.source_ref).toBeUndefined();
  });
  it('keeps a plain-object source_ref as-is', () => {
    const r = parseRecommendationInput({ ...base, source_ref: { playbook_run_id: 'p1' } });
    expect(r.ok && r.value.source_ref).toEqual({ playbook_run_id: 'p1' });
  });
  it('caps rationale and thesis_ref length', () => {
    expect(parseRecommendationInput({ ...base, rationale: 'x'.repeat(4001) })).toEqual({ ok: false, error: 'rationale too long (max 4000)' });
    expect(parseRecommendationInput({ ...base, thesis_ref: 'x'.repeat(201) })).toEqual({ ok: false, error: 'thesis_ref too long (max 200)' });
  });
});

describe('parseWithdrawInput', () => {
  it('accepts an empty body and an optional reason', () => {
    expect(parseWithdrawInput(undefined)).toEqual({ ok: true, value: { reason: undefined } });
    expect(parseWithdrawInput({ reason: '口误' })).toEqual({ ok: true, value: { reason: '口误' } });
  });
  it('caps the reason', () => {
    expect(parseWithdrawInput({ reason: 'x'.repeat(4001) })).toEqual({ ok: false, error: 'reason too long (max 4000)' });
  });
});
