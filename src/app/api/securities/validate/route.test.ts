import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ validate: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ from: vi.fn() })),
}));
vi.mock('@/lib/watchlist/security-validation', () => ({
  validateSelectableSecuritiesWithClient: mocks.validate,
}));

import { POST } from './route';

describe('POST /api/securities/validate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns canonical accepted and rejected tickers without persisting anything', async () => {
    mocks.validate.mockResolvedValue({
      canonicalTickers: ['600519.SH'],
      rejected: ['NOT-A-TICKER'],
    });
    const response = await POST(new Request('https://example.com/api/securities/validate', {
      method: 'POST',
      body: JSON.stringify({ tickers: ['600519', 'NOT-A-TICKER'] }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: ['600519.SH'], rejected: ['NOT-A-TICKER'] });
  });

  it('rejects malformed input before querying the security master', async () => {
    const response = await POST(new Request('https://example.com/api/securities/validate', {
      method: 'POST',
      body: JSON.stringify({ tickers: [] }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.validate).not.toHaveBeenCalled();
  });
});
