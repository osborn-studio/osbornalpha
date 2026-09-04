import { describe, expect, it } from 'vitest';
import { watchlistApiError } from './api-error';

describe('watchlist API error envelope', () => {
  it('provides a stable code, trace id, retry metadata, and safe details', async () => {
    const response = watchlistApiError('rate_limited', 429, {
      retryAfterSeconds: 60,
      details: { tickers: ['AAPL'] },
    });
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(body).toMatchObject({
      error: 'rate_limited', code: 'rate_limited', retryable: true,
      retryAfterSeconds: 60, tickers: ['AAPL'],
    });
    expect(body.requestId).toEqual(expect.any(String));
  });

  it('does not classify validation failures as retryable', async () => {
    expect(await watchlistApiError('invalid_request', 400).json()).toMatchObject({ retryable: false });
  });
});
