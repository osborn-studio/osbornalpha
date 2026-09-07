import { describe, expect, it } from 'vitest';
import { parseWatchlistDecisionContext } from './decision-context';

describe('parseWatchlistDecisionContext', () => {
  it('projects the bounded decision snapshot contract', () => {
    expect(parseWatchlistDecisionContext({
      schema_version: 1,
      captured_at: '2026-09-05T12:00:00Z',
      metric: { history_range: '1y', benchmark_ticker: 'SPY', calculator_version: 'v2', coverage_ratio: 0.91 },
      research: { news_count: 4, report_count: 2, latest_fetched_at: '2026-09-05T11:00:00Z' },
      perspective: { model_version: 'gpt-test', prompt_version: 'p3', resolved_analysis_mode: 'evidence_backed', evidence_result_count: 6, evidence_coverage_ratio: 0.8 },
      alerts: { unread_count: 1, failed_delivery_count: 0 },
      review_reasons: [{ id: 'review-1' }],
    })).toMatchObject({
      metric: { historyRange: '1y', benchmarkTicker: 'SPY', coverageRatio: 0.91 },
      research: { newsCount: 4, reportCount: 2 },
      perspective: { modelVersion: 'gpt-test', evidenceCount: 6, evidenceCoverageRatio: 0.8 },
      alerts: { unreadCount: 1, failedDeliveryCount: 0 },
      reviewReasonCount: 1,
    });
  });

  it('rejects unknown versions and bounds malformed counters', () => {
    expect(parseWatchlistDecisionContext({})).toBeNull();
    expect(parseWatchlistDecisionContext({ schema_version: 2 })).toBeNull();
    expect(parseWatchlistDecisionContext({ schema_version: 1, research: { news_count: -1 }, alerts: { unread_count: '2' } }))
      .toMatchObject({ research: { newsCount: 0 }, alerts: { unreadCount: 0 } });
  });
});
