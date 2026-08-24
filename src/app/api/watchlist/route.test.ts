import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  auth: vi.fn(),
  upsert: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth }, from: mocks.from })),
}));
vi.mock('@/lib/watchlist/security-validation', () => ({
  validateSelectableSecuritiesWithClient: mocks.validate,
}));

import { POST } from './route';

function request(ticker: string) {
  return new Request('https://example.com/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ watchlist_id: 'watchlist-1', ticker, name: 'Untrusted Name', asset_type: 'index' }),
  });
}

describe('POST /api/watchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.upsert.mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: 'item-1', ticker: '002463.SZ' }, error: null }) }),
    });
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
  });

  it('rejects unknown or pending securities before writing', async () => {
    mocks.validate.mockResolvedValue({ valid: false, canonicalTickers: [], rejected: ['MISSING'] });
    const response = await POST(request('MISSING'));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'security_not_selectable', tickers: ['MISSING'] });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('writes only the canonical ticker and ignores client identity fields', async () => {
    mocks.validate.mockResolvedValue({ valid: true, canonicalTickers: ['002463.SZ'], rejected: [] });
    expect((await POST(request('002463'))).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: '002463.SZ', user_id: 'user-1' }),
      expect.anything(),
    );
    expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty('name');
    expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty('asset_type');
  });
});
