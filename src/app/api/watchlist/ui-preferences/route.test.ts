import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WATCHLIST_UI_PREFERENCES } from '@/lib/watchlist/ui-preferences';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/ui-preferences-repository', () => ({
  loadWatchlistUiPreferences: mocks.load,
  updateWatchlistUiPreferences: mocks.update,
}));

import { GET, PUT } from './route';

const row = {
  watchlist_ui_preferences: DEFAULT_WATCHLIST_UI_PREFERENCES,
  watchlist_ui_preferences_version: 4,
  watchlist_ui_preferences_updated_at: '2026-09-04T12:00:00.000Z',
};

describe('watchlist UI preference route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.load.mockResolvedValue({ data: row, error: null });
    mocks.update.mockResolvedValue({ data: { ...row, watchlist_ui_preferences_version: 5 }, error: null });
  });

  it('returns a normalized versioned snapshot', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: 4, preferences: { schemaVersion: 2, viewMode: 'table' } });
  });

  it('validates and compare-and-swaps a complete snapshot', async () => {
    const response = await PUT(new Request('http://localhost/api/watchlist/ui-preferences', {
      method: 'PUT', body: JSON.stringify({ expectedVersion: 4, preferences: DEFAULT_WATCHLIST_UI_PREFERENCES }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.objectContaining({ expectedVersion: 4 }));
  });

  it('returns the current snapshot after a version conflict', async () => {
    mocks.update.mockResolvedValue({ data: null, error: null });
    const response = await PUT(new Request('http://localhost/api/watchlist/ui-preferences', {
      method: 'PUT', body: JSON.stringify({ expectedVersion: 3, preferences: DEFAULT_WATCHLIST_UI_PREFERENCES }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'watchlist_ui_preferences_conflict', version: 4 });
  });

  it('rejects partial or unversioned state before writing', async () => {
    const response = await PUT(new Request('http://localhost/api/watchlist/ui-preferences', {
      method: 'PUT', body: JSON.stringify({ preferences: { viewMode: 'kanban' } }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
