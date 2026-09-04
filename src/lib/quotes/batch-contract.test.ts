import { describe, expect, it } from 'vitest';
import { isQuoteBatchPayload, parseQuoteBatchRequest } from './batch-contract';

describe('quote batch contract', () => {
  it('normalizes, deduplicates and bounds ticker requests', () => {
    expect(parseQuoteBatchRequest(new URL('https://example.test/api/quote/batch?tickers=aapl,AAPL,%207000.HK'))).toEqual({
      tickers: ['AAPL', '7000.HK'],
      force: false,
    });
  });

  it('rejects malformed and oversized requests', () => {
    expect(parseQuoteBatchRequest(new URL('https://example.test/api/quote/batch'))).toEqual({ error: 'tickers_required' });
    expect(parseQuoteBatchRequest(new URL('https://example.test/api/quote/batch?tickers=bad%20symbol'))).toEqual({ error: 'invalid_ticker' });
    const tooMany = Array.from({ length: 41 }, (_, index) => `T${index}`).join(',');
    expect(parseQuoteBatchRequest(new URL(`https://example.test/api/quote/batch?tickers=${tooMany}`))).toEqual({ error: 'too_many_tickers' });
  });

  it('guards response shape without requiring a particular quote payload type', () => {
    expect(isQuoteBatchPayload({ quotes: { AAPL: { ticker: 'AAPL' }, NVDA: null }, meta: { failed: 0 } })).toBe(true);
    expect(isQuoteBatchPayload({ quotes: {} })).toBe(true);
    expect(isQuoteBatchPayload({})).toBe(false);
    expect(isQuoteBatchPayload({ quotes: [], meta: {} })).toBe(false);
    expect(isQuoteBatchPayload({ quotes: {}, meta: { failed: -1 } })).toBe(false);
  });

  it('requires an exact symbol-to-quote mapping when a chunk is supplied', () => {
    const valid = { quotes: { AAPL: { ticker: 'AAPL' }, NVDA: null }, meta: {} };
    expect(isQuoteBatchPayload(valid, { expectedTickers: ['AAPL', 'NVDA'] })).toBe(true);
    expect(isQuoteBatchPayload({ quotes: { AAPL: { ticker: 'NVDA' }, NVDA: null }, meta: {} }, { expectedTickers: ['AAPL', 'NVDA'] })).toBe(false);
    expect(isQuoteBatchPayload({ quotes: { AAPL: { ticker: 'AAPL' } }, meta: {} }, { expectedTickers: ['AAPL', 'NVDA'] })).toBe(false);
    expect(isQuoteBatchPayload({ quotes: { AAPL: { ticker: 'AAPL' }, NVDA: null, MSFT: null }, meta: {} }, { expectedTickers: ['AAPL', 'NVDA'] })).toBe(false);
  });
});
