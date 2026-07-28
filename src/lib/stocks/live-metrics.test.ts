import { describe, expect, it } from 'vitest';
import { deriveLiveRating, deriveLiveRisk } from './live-metrics';

describe('deriveLiveRating', () => {
  it('returns STRONG BUY at the top of the score range', () => {
    // score = 5 + 1*4 + (1 - 0.5)*4 = 11 → clamped to 10
    expect(deriveLiveRating({ biasScore: 1, hitRate5d: 1 })).toBe('STRONG BUY');
  });

  it('returns STRONG SELL at the bottom of the score range', () => {
    // score = 5 - 4 - 2 = -1 → clamped to 0
    expect(deriveLiveRating({ biasScore: -1, hitRate5d: 0 })).toBe('STRONG SELL');
  });

  it('neutral inputs land in HOLD', () => {
    // score = 5 + 0 + 0 = 5 → HOLD
    expect(deriveLiveRating({ biasScore: 0, hitRate5d: 0.5 })).toBe('HOLD');
  });

  it('STRONG BUY boundary at score = 8', () => {
    // score = 5 + 0.75*4 + 0 = 8
    expect(deriveLiveRating({ biasScore: 0.75, hitRate5d: 0.5 })).toBe('STRONG BUY');
  });

  it('BUY just below STRONG BUY boundary', () => {
    // score = 5 + 0.5*4 + 0 = 7
    expect(deriveLiveRating({ biasScore: 0.5, hitRate5d: 0.5 })).toBe('BUY');
  });

  it('BUY boundary at score = 6.5', () => {
    // score = 5 + 0.375*4 + 0 = 6.5
    expect(deriveLiveRating({ biasScore: 0.375, hitRate5d: 0.5 })).toBe('BUY');
  });

  it('HOLD just below BUY boundary', () => {
    // score = 5 + 0.25*4 + 0 = 6 → HOLD
    expect(deriveLiveRating({ biasScore: 0.25, hitRate5d: 0.5 })).toBe('HOLD');
  });

  it('HOLD boundary at score = 4.5', () => {
    // score = 5 - 0.125*4 + 0 = 4.5
    expect(deriveLiveRating({ biasScore: -0.125, hitRate5d: 0.5 })).toBe('HOLD');
  });

  it('SELL just below HOLD boundary', () => {
    // score = 5 - 0.5*4 + 0 = 3 → SELL (>=3)
    expect(deriveLiveRating({ biasScore: -0.5, hitRate5d: 0.5 })).toBe('SELL');
  });

  it('SELL boundary at score = 3', () => {
    expect(deriveLiveRating({ biasScore: -0.5, hitRate5d: 0.5 })).toBe('SELL');
  });

  it('STRONG SELL just below SELL boundary', () => {
    // score = 5 - 0.6*4 + 0 = 2.6 → STRONG SELL
    expect(deriveLiveRating({ biasScore: -0.6, hitRate5d: 0.5 })).toBe('STRONG SELL');
  });

  it('combines bias and hit rate constructively', () => {
    // score = 5 + 0.25*4 + (0.75-0.5)*4 = 5 + 1 + 1 = 7 → BUY
    expect(deriveLiveRating({ biasScore: 0.25, hitRate5d: 0.75 })).toBe('BUY');
  });

  it('combines bias and hit rate destructively', () => {
    // score = 5 - 0.25*4 + (0.25-0.5)*4 = 5 - 1 - 1 = 3 → SELL
    expect(deriveLiveRating({ biasScore: -0.25, hitRate5d: 0.25 })).toBe('SELL');
  });

  it('clamps an over-range raw score at the top to STRONG BUY', () => {
    // raw = 5 + 2*4 + 0 = 13, but biasScore is supposed to be -1..1; even with
    // an out-of-range input we should never break — clamp keeps us at 10.
    expect(deriveLiveRating({ biasScore: 2, hitRate5d: 0.5 })).toBe('STRONG BUY');
  });

  it('clamps an over-range raw score at the bottom to STRONG SELL', () => {
    expect(deriveLiveRating({ biasScore: -2, hitRate5d: 0.5 })).toBe('STRONG SELL');
  });

  it('handles non-finite inputs by treating them as neutral', () => {
    // NaN bias → 0, NaN hitRate → 0.5 → score = 5 → HOLD
    expect(deriveLiveRating({ biasScore: NaN, hitRate5d: NaN })).toBe('HOLD');
  });
});

describe('deriveLiveRisk', () => {
  it('returns 1 for cheap, calm names', () => {
    expect(deriveLiveRisk({ peTtm: 12, amplitude: 1 })).toBe(1);
  });

  it('returns 5 for expensive AND highly volatile names', () => {
    // pe>40 → +2, amp>5 → +2 → 1+2+2 = 5
    expect(deriveLiveRisk({ peTtm: 60, amplitude: 7 })).toBe(5);
  });

  it('pe <= 0 adds risk (loss-making)', () => {
    // pe<=0 → +2, amp small → 1+2 = 3
    expect(deriveLiveRisk({ peTtm: -5, amplitude: 1 })).toBe(3);
  });

  it('pe exactly 0 counts as <=0 and adds +2', () => {
    expect(deriveLiveRisk({ peTtm: 0, amplitude: 1 })).toBe(3);
  });

  it('mid-valuation (pe>25) adds +1', () => {
    expect(deriveLiveRisk({ peTtm: 30, amplitude: 1 })).toBe(2);
  });

  it('pe=25 does not trigger the +1 band (strict >25)', () => {
    expect(deriveLiveRisk({ peTtm: 25, amplitude: 1 })).toBe(1);
  });

  it('pe=40 does not trigger the +2 band but still hits +1', () => {
    // pe>40 is false; pe>25 is true → +1 → 2
    expect(deriveLiveRisk({ peTtm: 40, amplitude: 1 })).toBe(2);
  });

  it('amplitude > 3 adds +1', () => {
    expect(deriveLiveRisk({ peTtm: 12, amplitude: 4 })).toBe(2);
  });

  it('amplitude > 5 adds +2', () => {
    expect(deriveLiveRisk({ peTtm: 12, amplitude: 6 })).toBe(3);
  });

  it('amplitude exactly 5 only triggers +1 (strict >5)', () => {
    expect(deriveLiveRisk({ peTtm: 12, amplitude: 5 })).toBe(2);
  });

  it('amplitude exactly 3 does not trigger +1 (strict >3)', () => {
    expect(deriveLiveRisk({ peTtm: 12, amplitude: 3 })).toBe(1);
  });

  it('clamps extreme values to 5', () => {
    expect(deriveLiveRisk({ peTtm: 1000, amplitude: 1000 })).toBe(5);
  });

  it('clamps within 1..5 for any combination', () => {
    const samples = [
      { peTtm: -100, amplitude: 100 },
      { peTtm: 0, amplitude: 0 },
      { peTtm: 12, amplitude: 1 },
      { peTtm: 1e9, amplitude: 1e9 },
    ];
    for (const s of samples) {
      const r = deriveLiveRisk(s);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(5);
    }
  });

  it('handles non-finite inputs by treating them as 0 (loss-making, calm)', () => {
    // peTtm NaN → 0 → +2; amplitude NaN → 0 → no add → 1+2 = 3
    expect(deriveLiveRisk({ peTtm: NaN, amplitude: NaN })).toBe(3);
  });
});
