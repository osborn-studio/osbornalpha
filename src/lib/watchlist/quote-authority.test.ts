import { describe, expect, it } from 'vitest';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import { selectWatchlistDisplayQuote } from './quote-authority';

const quote = { ticker: 'AAPL', price: 100 } as LiveQuote;

describe('selectWatchlistDisplayQuote', () => {
  it('accepts only a positive validated batch quote', () => {
    expect(selectWatchlistDisplayQuote(quote)).toBe(quote);
    expect(selectWatchlistDisplayQuote({ ...quote, price: 0 })).toBeNull();
    expect(selectWatchlistDisplayQuote(undefined)).toBeNull();
  });
});
