import { describe, expect, it } from 'vitest';
import type { WatchlistAlertEvent, WatchlistItem } from '@/lib/supabase/database.types';
import type { WatchlistResearchBundle } from './research-service';
import { buildWatchlistWorkflowSummary } from './workflow-summary';

const item = (patch: Partial<WatchlistItem> = {}) => ({
  id: 'item-1', status: 'watching', decision_version: 2, thesis: 'Growth remains durable',
  review_at: '2026-09-05T00:00:00.000Z', ...patch,
} as WatchlistItem);

const research = (patch: Partial<WatchlistResearchBundle> = {}) => ({
  ticker: 'AAPL', news: { ticker: 'AAPL', items: [{}], meta: { status: 'complete' } },
  reports: { ticker: 'AAPL', items: [], meta: { status: 'complete' } }, perspectives: [{}],
  refresh: { refreshedAt: '2026-09-04T00:00:00.000Z' },
  quality: { totalSources: 1, eligibleSources: 1 }, ...patch,
} as WatchlistResearchBundle);

const alert = (patch: Partial<WatchlistAlertEvent> = {}) => ({
  id: 'alert-1', read_at: null, delivery_status: 'delivered', triggered_at: '2026-09-05T10:00:00.000Z',
  ...patch,
} as WatchlistAlertEvent);

describe('Watchlist workflow summary', () => {
  it('prioritizes delivery recovery and unread alerts ahead of scheduled work', () => {
    expect(buildWatchlistWorkflowSummary({
      item: item(), research: research(), alerts: [alert({ delivery_status: 'failed' })], decisions: [],
      now: new Date('2026-09-05T12:00:00.000Z'),
    }).nextAction).toBe('retry_alert_delivery');
    expect(buildWatchlistWorkflowSummary({
      item: item(), research: research(), alerts: [alert()], decisions: [],
      now: new Date('2026-09-05T12:00:00.000Z'),
    }).nextAction).toBe('review_alert');
  });

  it('exposes the full stage summary and due review state', () => {
    expect(buildWatchlistWorkflowSummary({
      item: item(), research: research(), alerts: [],
      decisions: [{ changed_at: '2026-09-04T12:00:00.000Z' } as never],
      now: new Date('2026-09-05T12:00:00.000Z'), timeZone: 'UTC',
    })).toMatchObject({
      research: { status: 'ready', sourceCount: 1, eligibleSourceCount: 1, perspectiveCount: 1 },
      alerts: { unread: 0, failedDelivery: 0 },
      review: { bucket: 'due_today', due: true },
      decision: { status: 'watching', version: 2, hasThesis: true },
      nextAction: 'review_decision',
    });
  });

  it('asks for research before model generation or thesis work', () => {
    const empty = research({
      news: { ticker: 'AAPL', items: [], meta: { status: 'unavailable' } } as never,
      reports: { ticker: 'AAPL', items: [], meta: { status: 'unavailable' } } as never,
      perspectives: [], quality: { totalSources: 0, eligibleSources: 0 } as never,
    });
    expect(buildWatchlistWorkflowSummary({
      item: item({ review_at: null }), research: empty, alerts: [], decisions: [],
    }).nextAction).toBe('refresh_research');
  });

  it('explains urgency and refreshes stale research before generating more analysis', () => {
    const stale = research({ refresh: { refreshedAt: '2026-08-01T00:00:00.000Z' } as never });
    expect(buildWatchlistWorkflowSummary({
      item: item({ review_at: null }), research: stale, alerts: [], decisions: [],
      now: new Date('2026-09-05T00:00:00.000Z'),
    })).toMatchObject({
      nextAction: 'refresh_research',
      priority: { score: 70, reasons: ['research_stale'] },
    });
  });

  it('does not call partial evidence monitoring-current', () => {
    const limited = research({ quality: { totalSources: 3, eligibleSources: 1 } as never });
    expect(buildWatchlistWorkflowSummary({
      item: item({ review_at: null }), research: limited, alerts: [], decisions: [],
      now: new Date('2026-09-05T00:00:00.000Z'),
    })).toMatchObject({
      nextAction: 'continue_research',
      priority: { score: 60, reasons: ['research_limited'] },
    });
  });
});
