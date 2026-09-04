import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), retry: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/alert-repository', () => ({
  updateWatchlistAlertEventReadState: mocks.read,
  retryWatchlistAlertEvent: mocks.retry,
}));

import { PATCH } from './route';

const context = { params: Promise.resolve({ id: 'event-1' }) };

describe('PATCH /api/watchlist/alert-events/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.read.mockResolvedValue({ data: { id: 'event-1', read_at: 'now' }, error: null });
    mocks.retry.mockResolvedValue({ data: { id: 'event-1', delivery_status: 'pending' }, error: null });
  });

  it('requeues a failed delivery through the owner-scoped repository', async () => {
    const response = await PATCH(new Request('http://localhost/api/watchlist/alert-events/event-1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ retry: true }),
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.retry).toHaveBeenCalledWith(expect.anything(), 'event-1');
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('rejects mixed operations', async () => {
    const response = await PATCH(new Request('http://localhost/api/watchlist/alert-events/event-1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ retry: true, read: true }),
    }), context);
    expect(response.status).toBe(400);
    expect(mocks.retry).not.toHaveBeenCalled();
  });
});
