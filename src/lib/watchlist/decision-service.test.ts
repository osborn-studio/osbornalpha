import { describe, expect, it, vi } from 'vitest';
import { executeWatchlistDecision } from './decision-service';

const mocks = vi.hoisted(() => ({ update: vi.fn(), load: vi.fn() }));
vi.mock('./server-repository', () => ({
  updateWatchlistItemDecision: mocks.update,
  loadWatchlistItem: mocks.load,
}));

const client = {} as never;
const command = { patch: { review_at: null }, expectedVersion: 2 };

describe('watchlist decision service', () => {
  it('returns the updated item', async () => {
    mocks.update.mockResolvedValueOnce({ data: { id: 'item-1' }, error: null });
    await expect(executeWatchlistDecision(client, 'user-1', 'item-1', command)).resolves.toEqual({
      status: 'updated', item: { id: 'item-1' },
    });
  });

  it('loads the canonical row after a conflict', async () => {
    mocks.update.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'conflict' } });
    mocks.load.mockResolvedValueOnce({ data: { id: 'item-1', decision_version: 3 }, error: null });
    await expect(executeWatchlistDecision(client, 'user-1', 'item-1', command)).resolves.toMatchObject({
      status: 'conflict', currentItem: { decision_version: 3 },
    });
  });

  it('distinguishes missing rows from storage failures', async () => {
    mocks.update.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'missing' } });
    await expect(executeWatchlistDecision(client, 'user-1', 'item-1', command)).resolves.toEqual({ status: 'not_found' });
    mocks.update.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'failed' } });
    await expect(executeWatchlistDecision(client, 'user-1', 'item-1', command)).resolves.toEqual({ status: 'failed' });
  });
});
