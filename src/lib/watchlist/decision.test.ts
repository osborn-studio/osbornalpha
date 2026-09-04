import { describe, expect, it } from 'vitest';
import { parseWatchlistDecisionCommand, parseWatchlistDecisionPatch } from './decision';

describe('watchlist decision patch', () => {
  it('normalizes user decision fields into the database contract', () => {
    expect(parseWatchlistDecisionPatch({
      thesis: '  Durable margins  ', targetPrice: 250, confidence: 75,
      invalidationConditions: 'Growth below 5%', reviewAt: '2026-10-01',
      tags: ['core', 'core'], status: 'watching', conviction: 8,
    })).toEqual({
      thesis: 'Durable margins', target_price: 250, confidence: 75,
      invalidation_conditions: 'Growth below 5%', review_at: '2026-10-01T00:00:00.000Z',
      tags: ['core'], status: 'watching', conviction: 8,
    });
  });

  it('rejects invalid ranges, dates, statuses, and empty patches', () => {
    expect(parseWatchlistDecisionPatch({ confidence: 101 })).toBeNull();
    expect(parseWatchlistDecisionPatch({ targetPrice: -1 })).toBeNull();
    expect(parseWatchlistDecisionPatch({ reviewAt: 'not-a-date' })).toBeNull();
    expect(parseWatchlistDecisionPatch({ status: 'bought' })).toBeNull();
    expect(parseWatchlistDecisionPatch({})).toBeNull();
  });

  it('requires an optimistic-lock version for write commands', () => {
    expect(parseWatchlistDecisionCommand({ thesis: 'Updated', expectedVersion: 2 }))
      .toEqual({ patch: { thesis: 'Updated' }, expectedVersion: 2 });
    expect(parseWatchlistDecisionCommand({ thesis: 'Updated' })).toBeNull();
    expect(parseWatchlistDecisionCommand({ thesis: 'Updated', expectedVersion: -1 })).toBeNull();
  });
});
