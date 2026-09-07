import { describe, expect, it, vi } from 'vitest';
import { executeWatchlistDecision, executeWatchlistReview } from './decision-service';

const mocks = vi.hoisted(() => ({ update: vi.fn(), review: vi.fn(), load: vi.fn() }));
vi.mock('./server-repository', () => ({
  updateWatchlistItemDecision: mocks.update,
  updateWatchlistReviewAction: mocks.review,
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

describe('watchlist review service', () => {
  const reviewCommand = { action: 'snooze' as const, expectedVersion: 2, reviewAt: '2026-09-12T12:00:00Z' };

  it('updates the item and review reasons through the atomic review command', async () => {
    mocks.review.mockResolvedValueOnce({ data: { id: 'item-1', decision_version: 3 }, error: null });
    await expect(executeWatchlistReview(client, 'user-1', 'item-1', reviewCommand)).resolves.toMatchObject({
      status: 'updated', item: { decision_version: 3 },
    });
    expect(mocks.review).toHaveBeenCalledWith(
      client, 'item-1', 2, 'snooze', '2026-09-12T12:00:00Z',
    );
  });

  it('loads the canonical item after an optimistic concurrency conflict', async () => {
    mocks.review.mockResolvedValueOnce({ data: null, error: { message: 'watchlist_decision_conflict' } });
    mocks.load.mockResolvedValueOnce({ data: { id: 'item-1', decision_version: 4 }, error: null });
    await expect(executeWatchlistReview(client, 'user-1', 'item-1', reviewCommand)).resolves.toMatchObject({
      status: 'conflict', currentItem: { decision_version: 4 },
    });
  });

  it('distinguishes missing rows, empty responses, and storage failures', async () => {
    mocks.review.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'missing' } });
    await expect(executeWatchlistReview(client, 'user-1', 'item-1', reviewCommand)).resolves.toEqual({ status: 'not_found' });
    mocks.review.mockResolvedValueOnce({ data: null, error: null });
    await expect(executeWatchlistReview(client, 'user-1', 'item-1', reviewCommand)).resolves.toEqual({ status: 'not_found' });
    mocks.review.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'failed' } });
    await expect(executeWatchlistReview(client, 'user-1', 'item-1', reviewCommand)).resolves.toEqual({ status: 'failed' });
  });
});
