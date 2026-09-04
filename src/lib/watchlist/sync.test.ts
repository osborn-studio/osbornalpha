import { describe, expect, it } from 'vitest';
import {
  groupsToMutations,
  isDefaultWatchlist,
  isWatchlistVersionConflict,
  mergeWatchlistGroups,
  parseWatchlistSyncRequest,
  serverToGroups,
  type ServerWatchlistRow,
} from './sync';
import { defaultWatchlistGroups, type WatchlistGroup } from './store';

describe('versioned watchlist sync contract', () => {
  it('accepts a normalized, versioned snapshot request', () => {
    expect(parseWatchlistSyncRequest({
      expectedVersion: 3,
      mutationId: 'mutation-123',
      groups: [{ id: 'local', name: 'Core', tickers: ['aapl', 'AAPL'] }],
    })).toEqual({
      expectedVersion: 3,
      mutationId: 'mutation-123',
      groups: [{ id: 'local', name: 'Core', tickers: ['AAPL'] }],
    });
  });

  it('rejects missing concurrency fields and classifies database conflicts', () => {
    expect(parseWatchlistSyncRequest({ groups: [] })).toBeNull();
    expect(parseWatchlistSyncRequest({ groups: [], expectedVersion: -1, mutationId: 'mutation-123' })).toBeNull();
    expect(isWatchlistVersionConflict({ code: '40001' })).toBe(true);
  });
});

function row(overrides: Partial<ServerWatchlistRow> = {}): ServerWatchlistRow {
  return {
    id: 'wl-1',
    name: 'Core',
    sort_order: 0,
    watchlist_items: [],
    ...overrides,
  };
}

describe('serverToGroups', () => {
  it('maps server rows (with nested items) to client WatchlistGroup shape', () => {
    const rows: ServerWatchlistRow[] = [
      row({
        id: 'wl-1',
        name: 'Core',
        sort_order: 0,
        watchlist_items: [
          { ticker: 'nvda', sort_order: 1 },
          { ticker: 'AAPL', sort_order: 0 },
        ],
      }),
    ];

    expect(serverToGroups(rows)).toEqual([
      { id: 'wl-1', name: 'Core', tickers: ['AAPL', 'NVDA'] },
    ]);
  });

  it('orders groups by sort_order', () => {
    const rows: ServerWatchlistRow[] = [
      row({ id: 'b', name: 'B', sort_order: 1 }),
      row({ id: 'a', name: 'A', sort_order: 0 }),
    ];

    expect(serverToGroups(rows).map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('returns empty array for empty input', () => {
    expect(serverToGroups([])).toEqual([]);
  });

  it('dedupes tickers within a group, keeping sort_order precedence', () => {
    const rows: ServerWatchlistRow[] = [
      row({
        watchlist_items: [
          { ticker: 'NVDA', sort_order: 0 },
          { ticker: 'NVDA', sort_order: 1 },
        ],
      }),
    ];
    expect(serverToGroups(rows)[0].tickers).toEqual(['NVDA']);
  });
});

describe('groupsToMutations', () => {
  it('detects a new group (client id not a server uuid) as an upsert with no serverId', () => {
    const current: ServerWatchlistRow[] = [];
    const incoming: WatchlistGroup[] = [{ id: 'local-abc', name: 'New Group', tickers: ['NVDA'] }];

    const result = groupsToMutations(current, incoming);

    expect(result.deleteIds).toEqual([]);
    expect(result.upserts).toEqual([{ serverId: undefined, name: 'New Group', sort_order: 0 }]);
    expect(result.itemsByGroup).toHaveLength(1);
    expect(result.itemsByGroup[0].tickers).toEqual(['NVDA']);
  });

  it('matches an existing group by id (server uuid) and updates name + tickers', () => {
    const current: ServerWatchlistRow[] = [
      row({ id: 'wl-1', name: 'Old Name', watchlist_items: [{ ticker: 'AAPL', sort_order: 0 }] }),
    ];
    const incoming: WatchlistGroup[] = [{ id: 'wl-1', name: 'New Name', tickers: ['NVDA'] }];

    const result = groupsToMutations(current, incoming);

    expect(result.deleteIds).toEqual([]);
    expect(result.upserts).toEqual([{ serverId: 'wl-1', name: 'New Name', sort_order: 0 }]);
    expect(result.itemsByGroup[0]).toEqual({ serverId: 'wl-1', tickers: ['NVDA'] });
  });

  it('falls back to matching by name when client id is not a known server id (local-only id survives a round trip)', () => {
    const current: ServerWatchlistRow[] = [row({ id: 'wl-1', name: 'Core', watchlist_items: [] })];
    const incoming: WatchlistGroup[] = [{ id: 'local-xyz', name: 'Core', tickers: ['TSLA'] }];

    const result = groupsToMutations(current, incoming);

    expect(result.upserts).toEqual([{ serverId: 'wl-1', name: 'Core', sort_order: 0 }]);
    expect(result.deleteIds).toEqual([]);
  });

  it('deletes groups present on server but absent from incoming snapshot (replace-all)', () => {
    const current: ServerWatchlistRow[] = [
      row({ id: 'wl-1', name: 'Keep' }),
      row({ id: 'wl-2', name: 'Drop' }),
    ];
    const incoming: WatchlistGroup[] = [{ id: 'wl-1', name: 'Keep', tickers: [] }];

    const result = groupsToMutations(current, incoming);

    expect(result.deleteIds).toEqual(['wl-2']);
    expect(result.upserts).toEqual([{ serverId: 'wl-1', name: 'Keep', sort_order: 0 }]);
  });

  it('preserves incoming order as sort_order', () => {
    const current: ServerWatchlistRow[] = [];
    const incoming: WatchlistGroup[] = [
      { id: 'a', name: 'A', tickers: [] },
      { id: 'b', name: 'B', tickers: [] },
    ];

    const result = groupsToMutations(current, incoming);
    expect(result.upserts.map((u) => u.sort_order)).toEqual([0, 1]);
  });

  it('handles empty incoming groups by deleting everything on server', () => {
    const current: ServerWatchlistRow[] = [row({ id: 'wl-1', name: 'Core' })];
    const result = groupsToMutations(current, []);

    expect(result.deleteIds).toEqual(['wl-1']);
    expect(result.upserts).toEqual([]);
    expect(result.itemsByGroup).toEqual([]);
  });

  it('caps at 50 groups and 200 tickers per group', () => {
    const incoming: WatchlistGroup[] = Array.from({ length: 60 }, (_, i) => ({
      id: `g${i}`,
      name: `Group ${i}`,
      tickers: Array.from({ length: 250 }, (_, j) => `T${j}`),
    }));

    const result = groupsToMutations([], incoming);

    expect(result.upserts).toHaveLength(50);
    expect(result.itemsByGroup[0].tickers).toHaveLength(200);
  });
});

describe('isDefaultWatchlist', () => {
  it('returns true for the untouched default groups', () => {
    expect(isDefaultWatchlist(defaultWatchlistGroups())).toBe(true);
  });

  it('returns false when a ticker was added to a default group', () => {
    const groups = defaultWatchlistGroups();
    groups[0].tickers.push('EXTRA');
    expect(isDefaultWatchlist(groups)).toBe(false);
  });

  it('returns false when a group was renamed', () => {
    const groups = defaultWatchlistGroups();
    groups[0].name = 'Renamed';
    expect(isDefaultWatchlist(groups)).toBe(false);
  });

  it('returns false for an empty groups array', () => {
    expect(isDefaultWatchlist([])).toBe(false);
  });

  it('is order-insensitive across groups', () => {
    const groups = defaultWatchlistGroups().reverse();
    expect(isDefaultWatchlist(groups)).toBe(true);
  });
});

describe('mergeWatchlistGroups', () => {
  it('preserves concurrent ticker additions while matching groups by id or name', () => {
    expect(mergeWatchlistGroups(
      [{ id: 'local', name: 'Core', tickers: ['AAPL', 'NVDA'] }, { id: 'new', name: 'Ideas', tickers: ['TSLA'] }],
      [{ id: 'server-core', name: 'Core', tickers: ['MSFT'] }],
    )).toEqual([
      { id: 'server-core', name: 'Core', tickers: ['MSFT', 'AAPL', 'NVDA'] },
      { id: 'new', name: 'Ideas', tickers: ['TSLA'] },
    ]);
  });

  it('normalizes ticker whitespace and does not merge unnamed groups by an empty key', () => {
    expect(mergeWatchlistGroups(
      [{ id: 'local-empty', name: '', tickers: [' AAPL ', ''] }, { id: 'local-core', name: 'Core', tickers: [' msft '] }],
      [{ id: 'server-empty', name: '', tickers: [' TSLA '] }, { id: 'server-core', name: 'Core', tickers: ['AAPL'] }],
    )).toEqual([
      { id: 'server-empty', name: '', tickers: ['TSLA'] },
      { id: 'server-core', name: 'Core', tickers: ['AAPL', 'MSFT'] },
      { id: 'local-empty', name: '', tickers: ['AAPL'] },
    ]);
  });
});
