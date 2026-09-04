import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  getServerSupabase: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: () => true,
  getServerSupabase: mocks.getServerSupabase,
}));
vi.mock('@/lib/watchlist/alert-repository', () => ({
  createWatchlistAlert: mocks.create,
  listWatchlistAlerts: mocks.list,
}));

import { POST } from './route';

describe('watchlist alert collection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    });
  });

  it('maps duplicate rule constraints to conflict', async () => {
    mocks.create.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } });
    const response = await POST(new Request('http://localhost/api/watchlist/alerts', {
      method: 'POST',
      body: JSON.stringify({ itemId: 'item-1', alertType: 'price', operator: 'gt', threshold: 100 }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'alert_already_exists', retryable: false });
  });
});
