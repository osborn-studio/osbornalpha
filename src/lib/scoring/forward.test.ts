import { describe, it, expect } from 'vitest';
import { scoreForward, callDirection, type ForwardCall } from './forward';
import type { KlineBar } from '@/lib/data/sources/eastmoney';

const call = (o: Partial<ForwardCall> = {}): ForwardCall => ({
  market: 'A', action: 'buy', at: '2026-06-01T00:00:00Z', confidence: null, ...o,
});

// One bar per calendar day starting at startDate, closes as given (no gaps).
function makeBars(startDate: string, closes: number[]): KlineBar[] {
  const start = new Date(startDate + 'T00:00:00Z');
  return closes.map((close, i) => {
    const t = new Date(start.getTime() + i * 86400000);
    return { time: t.toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1000 };
  });
}

describe('callDirection', () => {
  it('maps buy/add to +1, sell/trim/pass to -1, hold to 0', () => {
    expect(callDirection('buy')).toBe(1);
    expect(callDirection('add')).toBe(1);
    expect(callDirection('sell')).toBe(-1);
    expect(callDirection('trim')).toBe(-1);
    expect(callDirection('pass')).toBe(-1);
    expect(callDirection('hold')).toBe(0);
  });
});

describe('scoreForward — base bar', () => {
  it('uses the call-day bar as base and reports base/last close', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[60] = 123;
    const res = scoreForward(call(), makeBars('2026-06-01', closes));
    expect(res).not.toBeNull();
    expect(res!.base_close).toBe(100);
    expect(res!.base_date).toBe('2026-06-01');
    expect(res!.last_close).toBe(123);
    expect(res!.last_close_date).toBe('2026-07-31');
    expect(res!.forward_5d_pct).toBe(0);
  });

  it('falls back to the next trading day when the call day has no bar', () => {
    const res = scoreForward(call(), makeBars('2026-06-02', Array.from({ length: 61 }, () => 100)));
    expect(res!.base_date).toBe('2026-06-02');
  });

  it('returns null when every bar is before the call date', () => {
    expect(scoreForward(call(), makeBars('2026-05-01', Array.from({ length: 10 }, () => 100)))).toBeNull();
  });

  it('refuses a zero or non-finite base close', () => {
    expect(scoreForward(call(), makeBars('2026-06-01', [0, 100, 100, 100, 100, 110]))).toBeNull();
  });

  it('normalizes a late-UTC timestamp into the exchange trading day', () => {
    // 2026-06-01T23:00Z is 2026-06-02 07:00 in Shanghai → base must be the 06-02 bar (200).
    const bars = makeBars('2026-06-01', [100, 200, 200, 200, 200, 200, 220]);
    const res = scoreForward(call({ at: '2026-06-01T23:00:00Z' }), bars);
    expect(res!.base_close).toBe(200);
    expect(res!.forward_5d_pct).toBeCloseTo(10);
  });
});

describe('scoreForward — windows', () => {
  it('returns null when fewer than 5 bars follow the base', () => {
    expect(scoreForward(call(), makeBars('2026-06-01', [100, 100, 100, 100, 100]))).toBeNull();
  });

  it('fills 5d and leaves 20d/60d null with 5-19 following bars', () => {
    const res = scoreForward(call(), makeBars('2026-06-01', [100, 100, 100, 100, 100, 110, 100, 100, 100, 100, 100]));
    expect(res!.forward_5d_pct).toBe(10);
    expect(res!.forward_20d_pct).toBeNull();
    expect(res!.forward_60d_pct).toBeNull();
  });

  it('fills 5d and 20d, leaves 60d null with 20-59 following bars', () => {
    const closes = Array.from({ length: 41 }, () => 100);
    closes[5] = 105; closes[20] = 120;
    const res = scoreForward(call(), makeBars('2026-06-01', closes));
    expect(res!.forward_5d_pct).toBe(5);
    expect(res!.forward_20d_pct).toBe(20);
    expect(res!.forward_60d_pct).toBeNull();
  });
});

describe('scoreForward — hit / score / calibration', () => {
  it('buy + rising price → hit, score from 20d', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 110; closes[20] = 130;
    const res = scoreForward(call({ action: 'buy' }), makeBars('2026-06-01', closes));
    expect(res!.hit).toBe(true);
    expect(res!.score).toBe(30);
  });

  it('sell + falling price → hit, positive score', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 90; closes[20] = 80;
    const res = scoreForward(call({ action: 'sell' }), makeBars('2026-06-01', closes));
    expect(res!.hit).toBe(true);
    expect(res!.score).toBe(20);
  });

  it('hold → hit and score null, forwards populated', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 105;
    const res = scoreForward(call({ action: 'hold' }), makeBars('2026-06-01', closes));
    expect(res!.hit).toBeNull();
    expect(res!.score).toBeNull();
    expect(res!.forward_5d_pct).toBe(5);
  });

  it('uses 5d for the score when 20d is unavailable', () => {
    const res = scoreForward(call(), makeBars('2026-06-01', [100, 100, 100, 100, 100, 108, 100, 100, 100, 100, 100]));
    expect(res!.score).toBe(8);
  });

  it('flat 20d gives score 0, not the 5d fallback', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 110; closes[20] = 100;
    const res = scoreForward(call(), makeBars('2026-06-01', closes));
    expect(res!.score).toBe(0);
  });

  it('buckets confidence by 20 points and null stays null', () => {
    const bars = makeBars('2026-06-01', Array.from({ length: 61 }, () => 100));
    expect(scoreForward(call({ confidence: 100 }), bars)!.calibration_bucket).toBe('80-100');
    expect(scoreForward(call({ confidence: 45 }), bars)!.calibration_bucket).toBe('40-60');
    expect(scoreForward(call({ confidence: null }), bars)!.calibration_bucket).toBeNull();
  });
});
