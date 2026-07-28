import { describe, it, expect } from 'vitest';
import { effectivePlan, extendPass } from './plan';

describe('effectivePlan', () => {
  it('pro with null expiresAt (active subscription) stays pro', () => {
    expect(effectivePlan('pro', null, new Date('2026-07-03T00:00:00Z'))).toBe('pro');
  });

  it('pro with a future expiresAt (unexpired pass) stays pro', () => {
    expect(effectivePlan('pro', '2026-08-01T00:00:00Z', new Date('2026-07-03T00:00:00Z'))).toBe('pro');
  });

  it('pro with expiresAt exactly equal to now is expired (strict > comparison)', () => {
    const now = new Date('2026-07-03T00:00:00Z');
    expect(effectivePlan('pro', '2026-07-03T00:00:00.000Z', now)).toBe('free');
  });

  it('pro with a past expiresAt falls back to free', () => {
    expect(effectivePlan('pro', '2026-06-01T00:00:00Z', new Date('2026-07-03T00:00:00Z'))).toBe('free');
  });

  it('free plan stays free regardless of expiresAt', () => {
    expect(effectivePlan('free', null, new Date('2026-07-03T00:00:00Z'))).toBe('free');
    expect(effectivePlan('free', '2026-08-01T00:00:00Z', new Date('2026-07-03T00:00:00Z'))).toBe('free');
  });

  it('null plan falls back to free', () => {
    expect(effectivePlan(null, null, new Date('2026-07-03T00:00:00Z'))).toBe('free');
  });

  it('unrecognized plan strings pass through unchanged (e.g. admin handled via role elsewhere)', () => {
    expect(effectivePlan('enterprise', null, new Date('2026-07-03T00:00:00Z'))).toBe('enterprise');
  });
});

describe('extendPass', () => {
  it('from null current (first purchase): now + 30d', () => {
    const now = new Date('2026-07-03T00:00:00.000Z');
    expect(extendPass(null, now)).toBe('2026-08-02T00:00:00.000Z');
  });

  it('from an already-expired current: extends from now, not from the stale value', () => {
    const now = new Date('2026-07-03T00:00:00.000Z');
    expect(extendPass('2026-06-01T00:00:00.000Z', now)).toBe('2026-08-02T00:00:00.000Z');
  });

  it('stacks on top of a future (unexpired) current value: max(now, current) + 30d', () => {
    const now = new Date('2026-07-03T00:00:00.000Z');
    // current already extends 10 days past now — new pass should stack on top of it.
    expect(extendPass('2026-07-13T00:00:00.000Z', now)).toBe('2026-08-12T00:00:00.000Z');
  });

  it('respects a custom days argument', () => {
    const now = new Date('2026-07-03T00:00:00.000Z');
    expect(extendPass(null, now, 7)).toBe('2026-07-10T00:00:00.000Z');
  });
});
