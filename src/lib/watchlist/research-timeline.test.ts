import { describe, expect, it } from 'vitest';
import { buildWatchlistResearchTimeline, summarizeWatchlistResearchChanges } from './research-timeline';

const news = (id: string, sourceType = 'news') => ({
  id, title: `News ${id}`, source: 'reuters.com', url: null, snippet: '', sentiment: 0.5,
  sentimentConfidence: 0.75, publishedAt: `2026-09-0${id}.000Z`, fetchedAt: '2026-09-04T00:00:00Z',
  trustScore: 0.8, sourceType,
});
const report = (id: string, rating: string) => ({
  id, title: `Report ${id}`, broker: 'Broker A', rating, ratingNormalized: rating as 'buy' | 'sell',
  targetPriceMin: 100, targetPriceMax: 120, targetChangePct: null, url: null,
  publishedAt: `2026-09-0${id}T00:00:00Z`, source: 'feed', trustScore: 0.8,
});

describe('watchlist research timeline', () => {
  it('combines filing, news, report and perspective records by timestamp', () => {
    const timeline = buildWatchlistResearchTimeline({
      news: [news('1', 'filing')], reports: [report('2', 'buy')],
      perspectives: [{ persona: 'marks', name: 'Marks', stance: 'neutral', confidence: 7, summary: 'Cycle risk', cites: [] }],
      perspectivesGeneratedAt: '2026-09-03T00:00:00Z',
    });
    expect(timeline.map((item) => item.kind)).toEqual(['perspective', 'report', 'filing']);
  });

  it('merges calendar, decision and alert activity into the same chronology', () => {
    const timeline = buildWatchlistResearchTimeline({
      news: [], reports: [], perspectives: [], perspectivesGeneratedAt: null,
      calendar: [{ kind: 'earnings_announce', date: '20260908', title: 'Earnings', daysUntil: 4 }],
      decisions: [{
        id: 'decision-1', user_id: 'user-1', watchlist_item_id: 'item-1', version: 2,
        context_snapshot: {},
        before_value: { status: 'researching' }, after_value: { status: 'watching' },
        changed_at: '2026-09-04T10:00:00Z',
      }],
      alerts: [{
        id: 'alert-1', user_id: 'user-1', alert_id: 'rule-1', watchlist_item_id: 'item-1', ticker: 'AAPL',
        alert_type: 'price', event_key: 'price-1', observed_value: 201, threshold_numeric: 200,
        payload: { label: 'Price crossed 200' }, delivery_status: 'delivered', delivery_attempts: 1,
        last_delivery_error: null, claimed_at: null, next_delivery_at: '2026-09-04T11:00:00Z',
        dead_lettered_at: null, provider_message_id: null, delivered_at: '2026-09-04T11:00:00Z',
        read_at: null, triggered_at: '2026-09-04T11:00:00Z', created_at: '2026-09-04T11:00:00Z',
      }],
    });
    expect(timeline.map((item) => item.kind)).toEqual(['calendar', 'alert', 'decision']);
    expect(timeline.find((item) => item.kind === 'decision')?.detail).toBe('status');
    expect(timeline.find((item) => item.kind === 'alert')).toMatchObject({ title: 'Price crossed 200', read: false });
  });

  it('summarizes new artifacts and broker rating changes since the prior snapshot', () => {
    const before = { news: [news('1')], reports: [report('1', 'sell')], perspectives: [], perspectivesGeneratedAt: null };
    const after = { news: [news('1'), news('2')], reports: [report('1', 'sell'), report('2', 'buy')], perspectives: [], perspectivesGeneratedAt: null };
    expect(summarizeWatchlistResearchChanges(before, after)).toEqual({
      hasChanges: true, newNews: 1, newReports: 1, perspectivesChanged: false,
      ratingChanges: [{ broker: 'Broker A', from: 'sell', to: 'buy' }],
    });
  });
});
