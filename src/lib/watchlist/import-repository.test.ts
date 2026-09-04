import { describe, expect, it, vi } from 'vitest';
import type { PortableWatchlistBundle } from './export';
import { importPortableWatchlist } from './import-repository';

const bundle: PortableWatchlistBundle = {
  formatVersion: 3,
  exportedAt: '2026-09-04T12:00:00Z',
  groups: [{ name: 'Core', description: null, items: [] }],
};

describe('portable watchlist import repository', () => {
  it('maps the typed RPC response into the application contract', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        version: 4,
        groups_created: 1,
        groups_updated: 0,
        items_created: 2,
        items_updated: 1,
        alerts_created: 3,
        alerts_updated: 1,
      }],
      error: null,
    }));
    await expect(importPortableWatchlist({ rpc } as never, bundle, 'merge', 'mutation-123'))
      .resolves.toEqual({
        data: {
          version: 4,
          groupsCreated: 1,
          groupsUpdated: 0,
          itemsCreated: 2,
          itemsUpdated: 1,
          alertsCreated: 3,
          alertsUpdated: 1,
        },
        error: null,
      });
    expect(rpc).toHaveBeenCalledWith('import_watchlist_bundle', expect.objectContaining({
      p_mode: 'merge',
      p_mutation_id: 'mutation-123',
      p_bundle: { format_version: 3, groups: [{ name: 'Core', description: null, items: [] }] },
    }));
  });
});
