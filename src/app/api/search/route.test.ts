import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: vi.fn(async () => ({ rpc: vi.fn() })),
  serverIsSupabaseConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/securities/search', () => ({
  searchSecurities: vi.fn(async () => [{ t: '002463.SZ', n: '沪电股份', py: 'hdgf', m: 'A', asset_type: 'stock', selectable: true }]),
}));
vi.mock('@/lib/securities/legacy-search', () => ({
  legacySearchGET: vi.fn(async () => Response.json({ source: 'legacy', results: [] })),
}));

import { searchSecurities } from '@/lib/securities/search';
import { legacySearchGET } from '@/lib/securities/legacy-search';
import { GET } from './route';

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SECURITY_MASTER_SEARCH_ENABLED;
  });

  it('returns an empty response without touching providers', async () => {
    const providerFetch = vi.spyOn(globalThis, 'fetch');
    const response = await GET(new Request('https://example.com/api/search?q='));
    expect(await response.json()).toEqual({ source: 'empty', results: [] });
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('uses database-first search without an external fetch', async () => {
    const providerFetch = vi.spyOn(globalThis, 'fetch');
    const response = await GET(new Request('https://example.com/api/search?q=002463&limit=10'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: 'security-master' });
    expect(searchSecurities).toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('uses the isolated legacy path only when explicitly disabled', async () => {
    process.env.SECURITY_MASTER_SEARCH_ENABLED = 'false';
    const request = new Request('https://example.com/api/search?q=AAPL');
    expect(await GET(request)).toMatchObject({ status: 200 });
    expect(legacySearchGET).toHaveBeenCalledWith(request);
  });
});
