import { describe, it, expect } from 'vitest';
import { parseDecisionInput, parseTradeInput } from './validate';

describe('parseDecisionInput', () => {
  it('accepts a minimal valid decision', () => {
    const r = parseDecisionInput({ ticker: '300750', market: 'A', action: 'buy' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ ticker: '300750', market: 'A', action: 'buy', source_type: 'manual' });
  });

  it('rejects unknown action and bad confidence', () => {
    expect(parseDecisionInput({ ticker: 'X', market: 'A', action: 'yolo' }).ok).toBe(false);
    expect(parseDecisionInput({ ticker: 'X', market: 'A', action: 'buy', confidence: 150 }).ok).toBe(false);
  });

  it('rejects inverted entry zone', () => {
    const r = parseDecisionInput({ ticker: 'X', market: 'A', action: 'buy', entry_low: 100, entry_high: 90 });
    expect(r.ok).toBe(false);
  });

  it('rejects whitespace-only ticker', () => {
    expect(parseDecisionInput({ ticker: '   ', market: 'A', action: 'buy' }).ok).toBe(false);
  });

  it('rejects ticker longer than 20 chars', () => {
    expect(parseDecisionInput({ ticker: 'A'.repeat(21), market: 'A', action: 'buy' }).ok).toBe(false);
  });

  it('rejects invalid expires_at date string', () => {
    expect(parseDecisionInput({ ticker: 'X', market: 'A', action: 'buy', expires_at: 'not-a-date' }).ok).toBe(false);
  });

  it('accepts valid ISO expires_at', () => {
    const r = parseDecisionInput({ ticker: 'X', market: 'A', action: 'buy', expires_at: '2026-12-31T00:00:00Z' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.expires_at).toBe('2026-12-31T00:00:00Z');
  });

  it('rejects oversized thesis (4001 chars)', () => {
    expect(parseDecisionInput({ ticker: 'X', market: 'A', action: 'buy', thesis: 'a'.repeat(4001) }).ok).toBe(false);
  });

  it('rejects oversized source_ref (>16KB)', () => {
    const r = parseDecisionInput({ ticker: 'X', market: 'A', action: 'buy', source_ref: { blob: 'x'.repeat(17000) } });
    expect(r.ok).toBe(false);
  });

  it('silently drops array source_ref', () => {
    const r = parseDecisionInput({ ticker: 'X', market: 'A', action: 'buy', source_ref: [1, 2, 3] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source_ref).toBeUndefined();
  });
});

describe('parseTradeInput', () => {
  it('accepts a valid trade with defaults', () => {
    const r = parseTradeInput({ ticker: 'NVDA', direction: 'buy', price: 120.5, quantity: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ fee: 0, currency: 'CNY' });
  });

  it('rejects non-positive price/quantity', () => {
    expect(parseTradeInput({ ticker: 'X', direction: 'buy', price: 0, quantity: 1 }).ok).toBe(false);
    expect(parseTradeInput({ ticker: 'X', direction: 'sell', price: 10, quantity: -5 }).ok).toBe(false);
  });

  it('rejects NaN price', () => {
    expect(parseTradeInput({ ticker: 'X', direction: 'buy', price: NaN, quantity: 1 }).ok).toBe(false);
  });

  it('rejects invalid direction (hold)', () => {
    expect(parseTradeInput({ ticker: 'X', direction: 'hold', price: 10, quantity: 1 }).ok).toBe(false);
  });

  it('rejects invalid executed_at date string', () => {
    expect(parseTradeInput({ ticker: 'X', direction: 'buy', price: 10, quantity: 1, executed_at: 'not-a-date' }).ok).toBe(false);
  });

  it('rejects oversized note and currency', () => {
    expect(parseTradeInput({ ticker: 'X', direction: 'buy', price: 10, quantity: 1, note: 'n'.repeat(4001) }).ok).toBe(false);
    expect(parseTradeInput({ ticker: 'X', direction: 'buy', price: 10, quantity: 1, currency: 'TOOLONGCUR' }).ok).toBe(false);
  });
});
