import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_WATCHLIST_UI_PREFERENCES } from './ui-preferences';
import { loadWatchlistUiPreferences, updateWatchlistUiPreferences } from './ui-preferences-repository';

function client(result: { data: unknown; error: null }) {
  const maybeSingle = vi.fn(async () => result);
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle,
  };
  const table = {
    select: vi.fn(() => query),
    update: vi.fn(() => query),
  };
  return { value: { from: vi.fn(() => table) }, table, query };
}

describe('watchlist UI preferences repository', () => {
  it('loads only the portable UI preference columns for one user', async () => {
    const db = client({ data: null, error: null });
    await loadWatchlistUiPreferences(db.value as never, 'user-1');
    expect(db.table.select).toHaveBeenCalledWith(expect.stringContaining('watchlist_ui_preferences_version'));
    expect(db.query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('updates with an atomic expected-version predicate', async () => {
    const db = client({ data: null, error: null });
    await updateWatchlistUiPreferences(db.value as never, 'user-1', {
      expectedVersion: 7,
      preferences: DEFAULT_WATCHLIST_UI_PREFERENCES,
    }, new Date('2026-09-04T12:00:00.000Z'));
    expect(db.table.update).toHaveBeenCalledWith(expect.objectContaining({
      watchlist_ui_preferences_version: 8,
      watchlist_ui_preferences_updated_at: '2026-09-04T12:00:00.000Z',
    }));
    expect(db.query.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
    expect(db.query.eq).toHaveBeenNthCalledWith(2, 'watchlist_ui_preferences_version', 7);
  });
});
