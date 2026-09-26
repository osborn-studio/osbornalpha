import { describe, expect, it } from 'vitest';
import calendar from '../../../docs/handoffs/alpha-s4/calendar.json';
import { readFileSync } from 'node:fs';
import { planObservationSessions, observationWindowEnds, MARKET_POLICY_HASH, CALENDAR_HASH, MARKET_POLICY, MARKET_POLICY_V2, MARKET_POLICY_V2_HASH } from './market-policy';
import { POLICY_V2_HASH, POLICY_HASH, digest as engineDigest } from 'dsh-trade-strategy-evaluator/engine';

describe('market-policy/1.0 frozen rules', () => {
  it('pins the holiday, early-close and DST source facts', () => {
    const year = calendar.sessions.filter(s => s.date.startsWith('2026'));
    expect(year).toHaveLength(251);
    expect(year.filter(s => !s.full).map(s => s.date)).toEqual(['2026-11-27', '2026-12-24']);
    const holidays = ['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'];
    expect(year.some(s => holidays.includes(s.date.slice(5)))).toBe(false);
    expect(calendar.sessions.some(s => [0,6].includes(new Date(s.date).getUTCDay()))).toBe(false);
    expect(new Set(calendar.sessions.map(s => s.date)).size).toBe(calendar.sessions.length);
    expect(year.find(s => s.date === '2026-03-06')?.close).toBe('2026-03-06T21:00:00.000Z');
    expect(year.find(s => s.date === '2026-03-09')?.close).toBe('2026-03-09T20:00:00.000Z');
    expect(year.find(s => s.date === '2026-11-02')?.close).toBe('2026-11-02T21:00:00.000Z');
  });
  it('pins inclusive wait counting from the first full session', () => {
    const plan = planObservationSessions('2026-11-26T14:30:00-05:00', '2026-11-26T14:30:00-05:00');
    expect(plan.intendedStart.date).toBe('2026-11-30');
    expect(plan.waitExpiresAt).toBe('2026-12-11T21:00:00.000Z');
    expect(plan.fallbackCandidates).toHaveLength(9);
  });
  it('excludes a session opening exactly at the cutoff', () => {
    expect(planObservationSessions('2026-09-22T13:30:00Z', '2026-09-22T13:30:00Z').intendedStart.date).toBe('2026-09-23');
  });
  it('accepts equivalent timestamp serializations', () => {
    expect(observationWindowEnds('2026-11-20T16:00:00-05:00')).toEqual(observationWindowEnds('2026-11-20T21:00:00Z'));
  });
  it('rejects incomplete calendar coverage before accepting registration', () => {
    expect(() => planObservationSessions('2028-11-01T12:00:00Z', '2028-11-01T12:00:00Z')).toThrow('rule_unsupported');
    expect(() => planObservationSessions('not-a-date', '2026-09-22T13:00:00Z')).toThrow('invalid_timestamp');
    expect(() => planObservationSessions('2026-02-30T12:00:00Z', '2026-09-22T13:00:00Z')).toThrow('invalid_timestamp');
  });
  it('does not permit mutation after policy hashing', () => {
    expect(Object.isFrozen(MARKET_POLICY)).toBe(true);
    expect(() => MARKET_POLICY.windows_trading_sessions.push(100)).toThrow();
    expect(Object.isFrozen(calendar.range)).toBe(true);
    expect(Object.isFrozen(calendar.sessions[0])).toBe(true);
  });
  it('matches independently frozen digests', () => {
    expect(MARKET_POLICY_HASH).toBe(readFileSync('docs/handoffs/alpha-s4/market-policy.json.sha256', 'utf8').trim());
    expect(CALENDAR_HASH).toBe(readFileSync('docs/handoffs/alpha-s4/calendar.json.sha256', 'utf8').trim());
  });
  it('starts only after both server timestamps and after a complete session', () => {
    const p = planObservationSessions('2026-09-22T13:29:00Z', '2026-09-22T13:31:00Z');
    expect(p.intendedStart.date).toBe('2026-09-23');
  });
  it('skips the holiday and shortened session for a start', () => {
    expect(planObservationSessions('2026-11-26T00:00:00Z', '2026-11-26T00:00:00Z').intendedStart.date).toBe('2026-11-30');
  });
  it('keeps window endpoints fixed and counts early closes', () => {
    const ends = observationWindowEnds('2026-11-20T21:00:00.000Z');
    expect(ends[0].endsAt).toBe('2026-11-30T21:00:00.000Z');
  });
  it('does not invent sessions outside the frozen calendar', () => {
    expect(() => planObservationSessions('2029-01-01T00:00:00Z', '2029-01-01T00:00:00Z')).toThrow('rule_unsupported');
  });
});

describe('market-policy/2.0 released rules (E3b)', () => {
  it('matches the engine constant, the published .sha256 file and the frozen 1.0 hash', () => {
    expect(MARKET_POLICY_V2_HASH).toBe(POLICY_V2_HASH);
    expect(MARKET_POLICY_V2_HASH).toBe(readFileSync('docs/handoffs/alpha-s6/market-policy-v2.json.sha256', 'utf8').trim());
    expect(MARKET_POLICY_HASH).toBe(POLICY_HASH);
    expect(engineDigest(MARKET_POLICY_V2)).toBe(MARKET_POLICY_V2_HASH);
  });
  it('separates listing identity from the session calendar and keeps the 1.0 windows', () => {
    expect(MARKET_POLICY_V2.benchmark).toEqual({ ticker: 'SPY', listing_mic: 'ARCX', currency: 'USD' });
    expect(MARKET_POLICY_V2.target_listing_mics).toEqual(['XNYS']);
    expect(MARKET_POLICY_V2.calendar_mic).toBe('XNYS');
    expect(MARKET_POLICY_V2.windows_trading_sessions).toEqual(MARKET_POLICY.windows_trading_sessions);
    expect(Object.isFrozen(MARKET_POLICY_V2)).toBe(true);
  });
  it('plans the same sessions under 2.0 but stamps the 2.0 policy hash', () => {
    const v1 = planObservationSessions('2026-09-22T13:30:00Z', '2026-09-22T13:30:00Z');
    const v2 = planObservationSessions('2026-09-22T13:30:00Z', '2026-09-22T13:30:00Z', 'market-policy/2.0');
    expect(v2.intendedStart).toEqual(v1.intendedStart);
    expect(v2.marketPolicyHash).toBe(MARKET_POLICY_V2_HASH);
    expect(v1.marketPolicyHash).toBe(MARKET_POLICY_HASH);
  });
});
