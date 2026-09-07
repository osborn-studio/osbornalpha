import type { WatchlistOverviewRow } from './overview-contract';
import type { WatchlistDataNotice } from './data-notice';
import type { WatchlistReviewSummary } from './review-workflow';

export type WatchlistAttentionKind = 'delivery' | 'alert' | 'review' | 'data';
export type WatchlistAttentionSeverity = 'critical' | 'warning' | 'info';

export interface WatchlistAttentionItem {
  id: string;
  kind: WatchlistAttentionKind;
  severity: WatchlistAttentionSeverity;
  count: number;
  ticker: string | null;
}

export function buildWatchlistAttentionItems(input: {
  reviews: WatchlistReviewSummary;
  notices: WatchlistDataNotice[];
  rows: Record<string, WatchlistOverviewRow>;
}): WatchlistAttentionItem[] {
  const rows = Object.entries(input.rows);
  const failed = rows.filter(([, row]) => (row.alerts.value?.failedDeliveryCount ?? 0) > 0);
  const unread = rows.filter(([, row]) => (row.alerts.value?.unreadCount ?? 0) > 0);
  const reviewCount = input.reviews.overdue + input.reviews.dueToday;
  return [
    ...(failed.length > 0 ? [{
      id: 'delivery', kind: 'delivery' as const, severity: 'critical' as const,
      count: failed.reduce((sum, [, row]) => sum + (row.alerts.value?.failedDeliveryCount ?? 0), 0),
      ticker: failed[0][0],
    }] : []),
    ...(unread.length > 0 ? [{
      id: 'alert', kind: 'alert' as const, severity: 'warning' as const,
      count: unread.reduce((sum, [, row]) => sum + (row.alerts.value?.unreadCount ?? 0), 0),
      ticker: unread[0][0],
    }] : []),
    ...(reviewCount > 0 ? [{
      id: 'review', kind: 'review' as const,
      severity: input.reviews.overdue > 0 ? 'critical' as const : 'warning' as const,
      count: reviewCount, ticker: null,
    }] : []),
    ...(input.notices.length > 0 ? [{
      id: 'data', kind: 'data' as const,
      severity: input.notices.some((notice) => notice.severity === 'critical')
        ? 'critical' as const : 'info' as const,
      count: input.notices.length, ticker: null,
    }] : []),
  ];
}
