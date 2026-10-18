import { describe, it, expect } from 'vitest';
import { buildReviewDrafts, REVIEW_KLINE_BARS } from './review-store';
import type { Decision } from '@/lib/supabase/database.types';
import type { KlineBar } from '@/lib/data/sources/eastmoney';

const d = (o: Partial<Decision>): Decision => ({
  id: 'd1', user_id: 'u', ticker: '300750', market: 'A', action: 'buy', thesis: null,
  confidence: null, entry_low: null, entry_high: null, target_price: null, stop_loss: null,
  horizon: null, source_type: 'manual', source_ref: null, status: 'executed',
  decided_at: '2026-06-01T00:00:00Z', expires_at: null, recommendation_id: null, ...o,
});

function makeBars(startDate: string, closes: number[]): KlineBar[] {
  const start = new Date(startDate + 'T00:00:00Z');
  return closes.map((close, i) => {
    const t = new Date(start.getTime() + i * 86400000);
    return { time: t.toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1000 };
  });
}

const flat = (n: number) => Array.from({ length: n }, () => 100);

describe('buildReviewDrafts — K-line window guard', () => {
  it('scores a decision inside a full 120-bar window', () => {
    const bars = makeBars('2026-05-01', flat(REVIEW_KLINE_BARS)); // 05-01 .. 08-28 covers 06-01
    const { drafts, skipped } = buildReviewDrafts([d({})], new Map([['300750', bars]]));
    expect(skipped).toBe(0);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].decision_id).toBe('d1');
    expect(drafts[0].forward_5d_pct).toBe(0);
  });

  it('skips a decision older than the first bar of a full window', () => {
    const bars = makeBars('2026-06-10', flat(REVIEW_KLINE_BARS)); // window starts after the 06-01 decision
    const { drafts, skipped } = buildReviewDrafts([d({})], new Map([['300750', bars]]));
    expect(drafts).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('rides forward to the first bar on a short (newly listed) window', () => {
    const bars = makeBars('2026-06-10', flat(30));
    const { drafts, skipped } = buildReviewDrafts([d({})], new Map([['300750', bars]]));
    expect(skipped).toBe(0);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].forward_5d_pct).toBe(0);
  });

  it('skips when the ticker kline fetch failed (null bars) or is missing', () => {
    const { drafts, skipped } = buildReviewDrafts(
      [d({}), d({ id: 'd2', ticker: '000001' })],
      new Map([['300750', null]]),
    );
    expect(drafts).toHaveLength(0);
    expect(skipped).toBe(2);
  });
});
