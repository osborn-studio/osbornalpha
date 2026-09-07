import { describe, expect, it, vi } from 'vitest';
import type { ActivityDependencies } from './activity-service';
import { loadWatchlistActivityBundle } from './activity-service';

const now = new Date('2026-09-04T12:00:00.000Z');

describe('Watchlist activity service', () => {
  it('combines all activity domains and attaches user feedback and outcomes', async () => {
    const dependencies = {
      now: () => now,
      loadItem: vi.fn(async () => ({ data: { id: 'item-1' }, error: null })),
      loadResearch: vi.fn(async () => ({
        ticker: 'AAPL',
        news: { ticker: 'AAPL', items: [{ id: 'news-1', title: 'News', source: 'wire', url: null, snippet: '', sentiment: null, publishedAt: '2026-09-04T10:00:00Z', fetchedAt: '2026-09-04T10:00:00Z', trustScore: 0.8, sourceType: 'news' }], meta: { status: 'complete', providers: ['wire'], fetchedAt: '2026-09-04T10:00:00Z', warnings: [] } },
        reports: { ticker: 'AAPL', items: [{ id: 'report-1', title: 'Report', broker: 'Broker', rating: 'buy', ratingNormalized: 'buy', targetPriceMin: null, targetPriceMax: null, targetChangePct: null, url: null, publishedAt: '2026-09-04T09:00:00Z', source: 'feed', trustScore: 0.8 }], consensus: null, meta: { status: 'complete', providers: ['feed'], fetchedAt: '2026-09-04T09:00:00Z', warnings: [] } },
        perspectives: [{ id: '10000000-0000-4000-8000-000000000001', persona: 'marks', name: 'Marks', stance: 'neutral', confidence: 7, summary: 'Cycle risk', cites: [] }],
        perspectiveSource: 'model', perspectivesGeneratedAt: '2026-09-04T08:00:00Z', perspectiveProvenance: null,
        timeline: [], changes: null, refresh: { status: 'stored', refreshedAt: null, warnings: [] },
      })),
      loadHistory: vi.fn(async () => ({ data: [{ id: 'decision-1', user_id: 'user-1', watchlist_item_id: 'item-1', version: 2, before_value: { status: 'researching' }, after_value: { status: 'watching' }, changed_at: '2026-09-03T13:00:00Z' }], error: null })),
      loadAlerts: vi.fn(async () => ({ data: [{ id: 'alert-1', user_id: 'user-1', alert_id: 'rule-1', watchlist_item_id: 'item-1', ticker: 'AAPL', alert_type: 'price', event_key: 'price', observed_value: 201, threshold_numeric: 200, payload: { label: 'Crossed 200' }, delivery_status: 'delivered', delivery_attempts: 1, last_delivery_error: null, claimed_at: null, next_delivery_at: '2026-09-04T11:00:00Z', dead_lettered_at: null, provider_message_id: null, delivered_at: '2026-09-04T11:00:00Z', read_at: null, triggered_at: '2026-09-04T11:00:00Z', created_at: '2026-09-04T11:00:00Z' }], error: null })),
      loadCalendar: vi.fn(async () => ({ ticker: 'AAPL', as_of: now.toISOString(), horizon_days: 90, events: [{ kind: 'earnings_announce', date: '20260908', days_until: 4, title: 'Earnings', details: {} }], next_earnings: null })),
      loadState: vi.fn(async () => ({ user_id: 'user-1', ticker: 'AAPL', last_seen_at: '2026-09-04T10:30:00Z', updated_at: '2026-09-04T10:30:00Z' })),
      loadAssessments: vi.fn(async () => ({
        '10000000-0000-4000-8000-000000000001': {
          feedback: { id: 'feedback-1', user_id: 'user-1', perspective_id: '10000000-0000-4000-8000-000000000001', verdict: 'helpful', reason: null, corrected_stance: null, created_at: now.toISOString() },
          claimFeedback: [{ id: 'claim-feedback-1', user_id: 'user-1', perspective_id: '10000000-0000-4000-8000-000000000001', claim_id: 'claim_1', verdict: 'unsupported', reason: 'Weak source', created_at: now.toISOString(), updated_at: now.toISOString() }],
          outcomes: [{ id: 'outcome-1', user_id: 'user-1', perspective_id: '10000000-0000-4000-8000-000000000001', horizon_days: 30, reference_price: 100, outcome_price: 108, return_pct: 8, direction_correct: false, evaluated_at: now.toISOString() }],
        },
      })),
    } as unknown as ActivityDependencies;

    const bundle = await loadWatchlistActivityBundle({} as never, 'user-1', 'AAPL', dependencies);
    expect(new Set(bundle.timeline.map((item) => item.kind))).toEqual(new Set(['news', 'report', 'perspective', 'calendar', 'decision', 'alert']));
    expect(bundle.perspectives[0]).toMatchObject({
      id: '10000000-0000-4000-8000-000000000001',
      feedback: { verdict: 'helpful' },
      claimFeedback: { claim_1: { verdict: 'unsupported', reason: 'Weak source' } },
      outcomes: [{ horizonDays: 30, returnPct: 8, directionCorrect: false }],
    });
    // The alert is unseen; a future calendar occurrence is not permanently unread.
    expect(bundle.activity).toMatchObject({ unseenCount: 1, lastSeenAt: '2026-09-04T10:30:00Z', warnings: [] });
  });

  it('degrades optional activity sources without hiding stored research', async () => {
    const dependencies = {
      now: () => now,
      loadItem: vi.fn(async () => ({ data: { id: 'item-1' }, error: null })),
      loadResearch: vi.fn(async () => ({ ticker: 'AAPL', news: { items: [] }, reports: { items: [] }, perspectives: [], perspectiveSource: null, perspectivesGeneratedAt: null, timeline: [], changes: null, refresh: { status: 'stored', refreshedAt: null, warnings: [] } })),
      loadHistory: vi.fn(async () => ({ data: null, error: { message: 'offline' } })),
      loadAlerts: vi.fn(async () => ({ data: null, error: { message: 'offline' } })),
      loadCalendar: vi.fn(async () => { throw new Error('offline'); }),
      loadState: vi.fn(async () => { throw new Error('offline'); }),
      loadAssessments: vi.fn(async () => ({})),
    } as unknown as ActivityDependencies;
    const bundle = await loadWatchlistActivityBundle({} as never, 'user-1', 'AAPL', dependencies);
    expect(bundle.activity.warnings).toEqual(expect.arrayContaining([
      'calendar_unavailable', 'activity_state_unavailable', 'decision_history_unavailable', 'alert_events_unavailable',
    ]));
  });
});
