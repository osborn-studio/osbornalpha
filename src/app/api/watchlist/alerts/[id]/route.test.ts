import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchlistAlert } from '@/lib/supabase/database.types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  getServerSupabase: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: () => true,
  getServerSupabase: mocks.getServerSupabase,
}));
vi.mock('@/lib/watchlist/alert-repository', () => ({
  getWatchlistAlert: mocks.get,
  updateWatchlistAlert: mocks.update,
  deleteWatchlistAlert: mocks.remove,
}));

import { PATCH } from './route';

const current: WatchlistAlert = {
  id: 'alert-1', user_id: 'user-1', watchlist_item_id: 'item-1', alert_type: 'valuation',
  operator: 'gt', threshold_numeric: 20, config: { metric: 'pe_ttm' }, enabled: true,
  cooldown_minutes: 60, last_observed_value: null, last_observed_key: null,
  last_evaluated_at: null, last_triggered_at: null,
  created_at: '2026-09-04T00:00:00Z', updated_at: '2026-09-04T00:00:00Z',
};

describe('watchlist alert item route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    });
    mocks.get.mockResolvedValue({ data: current, error: null });
  });

  it('rejects a patch whose config is incompatible with the stored alert type', async () => {
    const response = await PATCH(new Request('http://localhost/api/watchlist/alerts/alert-1', {
      method: 'PATCH', body: JSON.stringify({ config: { values: ['sell'] } }),
    }), { params: Promise.resolve({ id: 'alert-1' }) });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('maps a duplicate produced by an otherwise valid update to conflict', async () => {
    mocks.update.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } });
    const response = await PATCH(new Request('http://localhost/api/watchlist/alerts/alert-1', {
      method: 'PATCH', body: JSON.stringify({ threshold: 30 }),
    }), { params: Promise.resolve({ id: 'alert-1' }) });
    expect(response.status).toBe(409);
  });
});
