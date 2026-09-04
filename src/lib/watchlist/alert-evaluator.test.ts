import { describe, expect, it } from 'vitest';
import type { WatchlistAlert } from '@/lib/supabase/database.types';
import { evaluateWatchlistAlert, evaluateWatchlistAlertBatch, type WatchlistAlertObservation } from './alert-evaluator';

const baseAlert: WatchlistAlert = {
  id: 'alert-1', user_id: 'user-1', watchlist_item_id: 'item-1', alert_type: 'price',
  operator: 'gte', threshold_numeric: 100, config: {}, enabled: true, cooldown_minutes: 60,
  last_observed_value: null, last_observed_key: null, last_evaluated_at: null,
  last_triggered_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

const observation: WatchlistAlertObservation = {
  observedAt: '2026-09-04T12:00:00Z', price: 101, changePct: 2, volumeRatio: 1.5,
  peTtm: 20, pb: 3, events: [], ratings: [], perspectives: [],
};

describe('evaluateWatchlistAlert', () => {
  it('matches a numeric threshold and emits an idempotency key', () => {
    const result = evaluateWatchlistAlert(baseAlert, observation);
    expect(result.triggered).toBe(true);
    expect(result.observedValue).toBe(101);
    expect(result.eventKey).toContain('price:gte:100');
  });

  it('requires a previous sample for crossing operators', () => {
    expect(evaluateWatchlistAlert({ ...baseAlert, operator: 'crosses_above' }, observation).triggered).toBe(false);
    expect(evaluateWatchlistAlert({ ...baseAlert, operator: 'crosses_above', last_observed_value: 99 }, observation).triggered).toBe(true);
  });

  it('never triggers a numeric rule from stale market data', () => {
    const result = evaluateWatchlistAlert(baseAlert, { ...observation, marketDataStatus: 'stale' });
    expect(result).toMatchObject({ triggered: false, reason: 'missing_data', observedValue: 101 });
  });

  it('respects cooldown while still returning the latest observation', () => {
    const result = evaluateWatchlistAlert({ ...baseAlert, last_triggered_at: '2026-09-04T11:30:00Z' }, observation);
    expect(result.reason).toBe('cooldown');
    expect(result.observedValue).toBe(101);
  });

  it('triggers a matching unseen perspective once', () => {
    const perspectiveAlert = { ...baseAlert, alert_type: 'perspective' as const, operator: null, threshold_numeric: null, config: { values: ['bear'] }, last_evaluated_at: '2026-09-04T11:00:00Z' };
    const withPerspective = { ...observation, perspectives: [{ key: 'p-2', label: 'Bear case', value: 'bear' }] };
    expect(evaluateWatchlistAlert(perspectiveAlert, withPerspective).triggered).toBe(true);
    expect(evaluateWatchlistAlert({ ...perspectiveAlert, last_observed_key: 'p-2' }, withPerspective).reason).toBe('already_seen');
  });

  it('filters event candidates by configured kind', () => {
    const eventAlert = { ...baseAlert, alert_type: 'event' as const, operator: null, threshold_numeric: null, config: { kinds: ['earnings'] }, last_evaluated_at: '2026-09-04T11:00:00Z' };
    const withEvents = { ...observation, events: [{ key: 'event-1', label: 'Earnings', kind: 'earnings' }] };
    expect(evaluateWatchlistAlert(eventAlert, withEvents).triggered).toBe(true);
  });

  it('baselines existing event data on the first evaluation', () => {
    const eventAlert = { ...baseAlert, alert_type: 'event' as const, operator: null, threshold_numeric: null };
    const result = evaluateWatchlistAlert(eventAlert, { ...observation, events: [{ key: 'old-event', label: 'Existing event' }] });
    expect(result.triggered).toBe(false);
    expect(result.observedKey).toBe('old-event');
  });

  it('emits every matching candidate for persistence-level deduplication', () => {
    const eventAlert = { ...baseAlert, alert_type: 'rating' as const, operator: null, threshold_numeric: null, last_observed_key: 'report-1' };
    const results = evaluateWatchlistAlertBatch(eventAlert, {
      ...observation,
      ratings: [
        { key: 'report-3', label: 'Downgrade' },
        { key: 'report-2', label: 'Target raised' },
        { key: 'report-1', label: 'Initiated' },
      ],
    });
    expect(results.map((result) => result.eventKey)).toEqual(['rating:report-3', 'rating:report-2', 'rating:report-1']);
  });

  it('establishes skipped baselines for every candidate on first evaluation', () => {
    const eventAlert = { ...baseAlert, alert_type: 'rating' as const, operator: null, threshold_numeric: null };
    const results = evaluateWatchlistAlertBatch(eventAlert, {
      ...observation,
      ratings: [{ key: 'report-2', label: 'Newest' }, { key: 'report-1', label: 'Older' }],
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ triggered: false, eventKey: 'rating:report-2', observedKey: 'report-2', reason: 'already_seen' });
    expect(results[1]).toMatchObject({ triggered: false, eventKey: 'rating:report-1', observedKey: 'report-1', reason: 'already_seen' });
  });

  it('records matching candidates as skipped while a discrete rule is cooling down', () => {
    const eventAlert = {
      ...baseAlert,
      alert_type: 'rating' as const,
      operator: null,
      threshold_numeric: null,
      last_evaluated_at: '2026-09-04T11:00:00Z',
      last_triggered_at: '2026-09-04T11:30:00Z',
    };
    const results = evaluateWatchlistAlertBatch(eventAlert, {
      ...observation,
      ratings: [{ key: 'report-2', label: 'New during cooldown' }],
    });
    expect(results).toEqual([expect.objectContaining({
      triggered: false,
      eventKey: 'rating:report-2',
      reason: 'cooldown',
    })]);
  });
});
