import { describe, expect, it } from 'vitest';
import {
  deriveRating, deriveRiskLevel, parseTarget, deriveTargetPrice,
  deriveValuationRange, rangePosition,
} from './metrics';

describe('deriveRating', () => {
  it('maps sentinel score to rating bands', () => {
    expect(deriveRating(8.5)?.label).toBe('STRONG BUY');
    expect(deriveRating(7)?.label).toBe('BUY');
    expect(deriveRating(5)?.label).toBe('HOLD');
    expect(deriveRating(3.5)?.label).toBe('SELL');
    expect(deriveRating(1)?.label).toBe('STRONG SELL');
  });
  it('returns null when unscored (stub)', () => {
    expect(deriveRating(0)).toBeNull();
    expect(deriveRating(NaN)).toBeNull();
  });
});

describe('deriveRiskLevel', () => {
  it('null when no data', () => {
    expect(deriveRiskLevel({ pe_ttm: 0, amplitude: 0, dividend_yield: 0 })).toBeNull();
  });
  it('low risk for cheap, calm, dividend payer', () => {
    expect(deriveRiskLevel({ pe_ttm: 12, amplitude: 1, dividend_yield: 3 })).toBe(1);
  });
  it('high risk for expensive + volatile', () => {
    expect(deriveRiskLevel({ pe_ttm: 60, amplitude: 7, dividend_yield: 0 })).toBe(5);
  });
  it('loss-making (pe<=0) adds risk', () => {
    expect(deriveRiskLevel({ pe_ttm: -5, amplitude: 1, dividend_yield: 0 })).toBe(3);
  });
  it('clamps within 1..5', () => {
    const r = deriveRiskLevel({ pe_ttm: 100, amplitude: 50, dividend_yield: 0 });
    expect(r).toBeGreaterThanOrEqual(1);
    expect(r).toBeLessThanOrEqual(5);
  });
});

describe('parseTarget', () => {
  it('strips currency and commas', () => {
    expect(parseTarget('HK$580')).toBe(580);
    expect(parseTarget('$1,250')).toBe(1250);
    expect(parseTarget('—')).toBeNull();
  });
});

describe('deriveTargetPrice', () => {
  it('median of broker targets', () => {
    const reports = [
      { broker: 'a', date: '', rating: '', target: '$420', target_change_pct: 0 },
      { broker: 'b', date: '', rating: '', target: '$560', target_change_pct: 0 },
      { broker: 'c', date: '', rating: '', target: '$580', target_change_pct: 0 },
    ];
    expect(deriveTargetPrice(reports)).toBe(560);
  });
  it('null for empty', () => { expect(deriveTargetPrice([])).toBeNull(); });
});

describe('deriveValuationRange', () => {
  it('min/max of ≥2 targets', () => {
    const reports = [
      { broker: 'a', date: '', rating: '', target: '$420', target_change_pct: 0 },
      { broker: 'b', date: '', rating: '', target: '$580', target_change_pct: 0 },
    ];
    expect(deriveValuationRange(reports)).toEqual({ min: 420, max: 580 });
  });
  it('null with <2 targets', () => {
    expect(deriveValuationRange([{ broker: 'a', date: '', rating: '', target: '$420', target_change_pct: 0 }])).toBeNull();
  });
});

describe('rangePosition', () => {
  it('clamps 0..1', () => {
    expect(rangePosition(500, { min: 420, max: 580 })).toBeCloseTo(0.5, 1);
    expect(rangePosition(300, { min: 420, max: 580 })).toBe(0);
    expect(rangePosition(700, { min: 420, max: 580 })).toBe(1);
  });
});
