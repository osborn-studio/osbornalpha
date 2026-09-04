import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), item: vi.fn(), history: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth }, from: mocks.from })),
}));
vi.mock('@/lib/watchlist/server-repository', () => ({
  updateWatchlistItemDecision: mocks.update,
  loadWatchlistItem: mocks.item,
  loadWatchlistItemDecisionHistory: mocks.history,
}));

import { GET, PATCH } from './route';

describe('PATCH /api/watchlist/items/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.update.mockImplementation(async (_client, _itemId, patch, expectedVersion) => ({
      data: { id: 'item-1', decision_version: expectedVersion + 1, ...patch }, error: null,
    }));
    mocks.item.mockResolvedValue({ data: { id: 'item-1', ticker: 'AAPL', decision_version: 2 }, error: null });
    mocks.history.mockResolvedValue({ data: [{ id: 'history-1', version: 2 }], error: null });
  });

  it('returns the current item and its decision history', async () => {
    const response = await GET(new Request('https://example.com/api/watchlist/items/item-1'), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ item: { ticker: 'AAPL' }, history: [{ version: 2 }] });
  });

  it('writes only validated decision fields', async () => {
    const response = await PATCH(new Request('https://example.com/api/watchlist/items/item-1', {
      method: 'PATCH', body: JSON.stringify({ thesis: 'Durable growth', confidence: 80, expectedVersion: 3 }),
    }), { params: Promise.resolve({ id: 'item-1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ item: { thesis: 'Durable growth', confidence: 80 } });
  });

  it('rejects invalid input before writing', async () => {
    const response = await PATCH(new Request('https://example.com/api/watchlist/items/item-1', {
      method: 'PATCH', body: JSON.stringify({ confidence: 800, expectedVersion: 0 }),
    }), { params: Promise.resolve({ id: 'item-1' }) });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 409 when the decision version changed', async () => {
    mocks.update.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'watchlist_decision_conflict' } });
    const response = await PATCH(new Request('https://example.com/api/watchlist/items/item-1', {
      method: 'PATCH', body: JSON.stringify({ thesis: 'Changed', expectedVersion: 1 }),
    }), { params: Promise.resolve({ id: 'item-1' }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ currentItem: { decision_version: 2 } });
  });

  it('maps a missing RPC row to 404', async () => {
    mocks.update.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'watchlist_item_not_found' } });
    const response = await PATCH(new Request('https://example.com/api/watchlist/items/missing', {
      method: 'PATCH', body: JSON.stringify({ thesis: 'Changed', expectedVersion: 1 }),
    }), { params: Promise.resolve({ id: 'missing' }) });
    expect(response.status).toBe(404);
  });
});
