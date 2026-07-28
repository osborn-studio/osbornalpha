import { describe, it, expect } from 'vitest';
import { scoreDecision } from './review';
import type { Decision } from '@/lib/supabase/database.types';
import type { KlineBar } from '@/lib/data/sources/eastmoney';

const d = (o: Partial<Decision>): Decision => ({
  id: 'd1', user_id: 'u', ticker: '300750', market: 'A', action: 'buy', thesis: null,
  confidence: null, entry_low: null, entry_high: null, target_price: null, stop_loss: null,
  horizon: null, source_type: 'manual', source_ref: null, status: 'executed',
  decided_at: '2026-06-01T00:00:00Z', expires_at: null, ...o,
});

// Helper: build N bars starting at a given date, one per day, with given closes.
const bar = (time: string, close: number): KlineBar => ({
  time, open: close, high: close, low: close, close, volume: 1000,
});

// Bars from 2026-06-01 .. 2026-06-01 + (closes.length-1) days, all present (no gaps).
function makeBars(startDate: string, closes: number[]): KlineBar[] {
  const start = new Date(startDate + 'T00:00:00Z');
  return closes.map((close, i) => {
    const t = new Date(start.getTime() + i * 86400000);
    return bar(t.toISOString().slice(0, 10), close);
  });
}

describe('scoreDecision — base bar location', () => {
  it('uses the decision-day bar as base when it exists', () => {
    // base close = 100 on 2026-06-01; 5d,20d,60d all present and flat -> forwards 0
    const closes = Array.from({ length: 61 }, () => 100);
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.forward_5d_pct).toBe(0);
  });

  it('falls back to the next trading day when decision day is suspended (no bar that day)', () => {
    // bars skip 2026-06-01 (suspended), first bar is 2026-06-02 with close 100
    const closes = Array.from({ length: 61 }, () => 100);
    const bars = makeBars('2026-06-02', closes);
    const res = scoreDecision(d({ decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.forward_5d_pct).toBe(0);
  });

  it('returns null when all bars are earlier than the decision date', () => {
    const closes = Array.from({ length: 10 }, () => 100);
    const bars = makeBars('2026-05-01', closes); // 2026-05-01..2026-05-10, all before decided_at
    const res = scoreDecision(d({ decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).toBeNull();
  });
});

describe('scoreDecision — forward window sufficiency', () => {
  it('returns null overall when fewer than 5 bars follow the base bar', () => {
    // base + only 4 more bars => 5d not reachable
    const closes = Array.from({ length: 5 }, () => 100); // base idx0 + 4 following
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).toBeNull();
  });

  it('returns forward_5d but null forward_20d/forward_60d when only 5-19 bars follow', () => {
    // base idx0 + 10 following bars (11 total) -> 5d ok, 20d/60d null
    const closes = [100, 100, 100, 100, 100, 110, 100, 100, 100, 100, 100];
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.forward_5d_pct).toBe(10);
    expect(res!.forward_20d_pct).toBeNull();
    expect(res!.forward_60d_pct).toBeNull();
  });

  it('returns forward_5d and forward_20d but null forward_60d when 20-59 bars follow', () => {
    const closes = Array.from({ length: 41 }, () => 100); // base idx0 + 40 following
    closes[5] = 105; // +5% at 5d
    closes[20] = 120; // +20% at 20d
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.forward_5d_pct).toBe(5);
    expect(res!.forward_20d_pct).toBe(20);
    expect(res!.forward_60d_pct).toBeNull();
  });
});

describe('scoreDecision — direction / hit / score', () => {
  it('buy + price rises -> hit true, positive score', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 110; // +10% at 5d
    closes[20] = 130; // +30% at 20d
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ action: 'buy', decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.hit).toBe(true);
    expect(res!.score).toBe(30); // uses forward_20d since present
  });

  it('sell + price falls -> hit true, positive score', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 90; // -10% at 5d
    closes[20] = 80; // -20% at 20d
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ action: 'sell', decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.hit).toBe(true);
    expect(res!.score).toBe(20); // -20 * -1
  });

  it('hold -> hit and score are null but forward returns are still populated', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 105;
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ action: 'hold', decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.hit).toBeNull();
    expect(res!.score).toBeNull();
    expect(res!.forward_5d_pct).toBe(5);
  });

  it('uses forward_5d for score when forward_20d is unavailable', () => {
    const closes = [100, 100, 100, 100, 100, 108, 100, 100, 100, 100, 100]; // base + 10 following
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ action: 'buy', decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.forward_20d_pct).toBeNull();
    expect(res!.score).toBe(8); // forward_5d * +1
  });
});

describe('scoreDecision — calibration bucket', () => {
  it('confidence 100 maps to bucket "80-100"', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ confidence: 100, decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.calibration_bucket).toBe('80-100');
  });

  it('null confidence maps to a null calibration bucket', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ confidence: null, decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.calibration_bucket).toBeNull();
  });

  it('mid-range confidence maps to its 20-point bucket', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ confidence: 45, decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.calibration_bucket).toBe('40-60');
  });
});

describe('scoreDecision — decision_id passthrough', () => {
  it('includes the decision id in the returned draft', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    const bars = makeBars('2026-06-01', closes);
    const res = scoreDecision(d({ id: 'abc-123', decided_at: '2026-06-01T00:00:00Z' }), bars);
    expect(res).not.toBeNull();
    expect(res!.decision_id).toBe('abc-123');
  });
});

describe('review hardening (post-review fixes)', () => {
  const mk = (start: string, closes: number[]): KlineBar[] => {
    const bars: KlineBar[] = [];
    const d = new Date(start + 'T00:00:00Z');
    for (const close of closes) {
      bars.push({ time: d.toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1 });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return bars;
  };
  const base = (o: Partial<Decision>): Decision => ({
    id: 'd1', user_id: 'u', ticker: '300750', market: 'A', action: 'buy', thesis: null,
    confidence: null, entry_low: null, entry_high: null, target_price: null, stop_loss: null,
    horizon: null, source_type: 'manual', source_ref: null, status: 'open',
    decided_at: '2026-06-01T00:00:00Z', expires_at: null, ...o,
  });

  it('refuses to score when base close is 0 (bad feed guard)', () => {
    const bars = mk('2026-06-01', [0, 100, 100, 100, 100, 110]);
    expect(scoreDecision(base({}), bars)).toBeNull();
  });

  it('normalizes late-UTC decided_at into the exchange trading day', () => {
    // 2026-06-01T23:00:00Z = 2026-06-02 07:00 Beijing → base bar must be 06-02 (close 200), not 06-01 (100)
    const bars = mk('2026-06-01', [100, 200, 200, 200, 200, 200, 220]);
    const r = scoreDecision(base({ decided_at: '2026-06-01T23:00:00Z' }), bars);
    expect(r?.forward_5d_pct).toBeCloseTo(10); // (220-200)/200
  });

  it('locks ?? semantics: flat 0% 20d forward gives score 0, not the 5d fallback', () => {
    const closes = Array.from({ length: 61 }, () => 100);
    closes[5] = 110; // 5d = +10
    closes[20] = 100; // 20d = 0 → score must be 0
    const r = scoreDecision(base({}), mk('2026-06-01', closes));
    expect(r?.forward_20d_pct).toBe(0);
    expect(r?.score).toBe(0);
  });

  it('pass direction: falling price is a hit with positive score', () => {
    const closes = Array.from({ length: 61 }, (_, i) => 100 - i * 0.5);
    const r = scoreDecision(base({ action: 'pass' }), mk('2026-06-01', closes));
    expect(r?.hit).toBe(true);
    expect(r?.score).toBeGreaterThan(0);
    expect(r?.forward_60d_pct).toBeCloseTo(((closes[60] - closes[0]) / closes[0]) * 100, 1);
  });
});
