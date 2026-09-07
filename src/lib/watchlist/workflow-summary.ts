import type {
  WatchlistAlertEvent,
  WatchlistItem,
  WatchlistItemDecisionHistory,
} from '@/lib/supabase/database.types';
import type { WatchlistResearchBundle } from './research-service';
import { watchlistReviewBucket, type WatchlistReviewBucket } from './review-workflow';
import { WATCHLIST_RESEARCH_WINDOW_DAYS } from './research-window';

export type WatchlistWorkflowNextAction =
  | 'retry_alert_delivery'
  | 'review_alert'
  | 'review_decision'
  | 'refresh_research'
  | 'generate_perspectives'
  | 'document_thesis'
  | 'continue_research'
  | 'monitor';

export type WatchlistWorkflowReason =
  | 'delivery_failed'
  | 'unread_alert'
  | 'review_overdue'
  | 'review_due_today'
  | 'research_unavailable'
  | 'research_stale'
  | 'research_limited'
  | 'perspectives_missing'
  | 'thesis_missing'
  | 'research_incomplete'
  | 'monitoring_current';

export interface WatchlistWorkflowSummary {
  research: {
    status: 'ready' | 'limited' | 'unavailable';
    sourceCount: number;
    eligibleSourceCount: number;
    perspectiveCount: number;
    refreshedAt: string | null;
  };
  alerts: {
    unread: number;
    failedDelivery: number;
    latestTriggeredAt: string | null;
  };
  review: {
    bucket: WatchlistReviewBucket;
    due: boolean;
  };
  decision: {
    status: WatchlistItem['status'];
    version: number;
    hasThesis: boolean;
    lastChangedAt: string | null;
  };
  nextAction: WatchlistWorkflowNextAction;
  priority: {
    score: number;
    reasons: WatchlistWorkflowReason[];
  };
}

function latest(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => !!value).sort().at(-1) ?? null;
}

type WorkflowState = Omit<WatchlistWorkflowSummary, 'nextAction' | 'priority'>;

export function watchlistWorkflowPriority(
  input: WorkflowState,
  now = new Date(),
): Pick<WatchlistWorkflowSummary, 'nextAction' | 'priority'> {
  if (input.alerts.failedDelivery > 0) return {
    nextAction: 'retry_alert_delivery', priority: { score: 100, reasons: ['delivery_failed'] },
  };
  if (input.alerts.unread > 0) return {
    nextAction: 'review_alert', priority: { score: Math.min(99, 90 + input.alerts.unread), reasons: ['unread_alert'] },
  };
  if (input.review.due) {
    const overdue = input.review.bucket === 'overdue';
    return {
      nextAction: 'review_decision',
      priority: { score: overdue ? 85 : 80, reasons: [overdue ? 'review_overdue' : 'review_due_today'] },
    };
  }
  if (input.research.status === 'unavailable') return {
    nextAction: 'refresh_research', priority: { score: 75, reasons: ['research_unavailable'] },
  };
  const refreshedAt = input.research.refreshedAt ? Date.parse(input.research.refreshedAt) : Number.NaN;
  if (Number.isFinite(refreshedAt)
    && now.getTime() - refreshedAt > WATCHLIST_RESEARCH_WINDOW_DAYS * 86_400_000) {
    return { nextAction: 'refresh_research', priority: { score: 70, reasons: ['research_stale'] } };
  }
  if (input.research.status === 'limited') return {
    nextAction: 'continue_research', priority: { score: 60, reasons: ['research_limited'] },
  };
  if (input.research.perspectiveCount === 0) return {
    nextAction: 'generate_perspectives', priority: { score: 50, reasons: ['perspectives_missing'] },
  };
  if (!input.decision.hasThesis) return {
    nextAction: 'document_thesis', priority: { score: 40, reasons: ['thesis_missing'] },
  };
  if (input.decision.status === 'inbox' || input.decision.status === 'researching') return {
    nextAction: 'continue_research', priority: { score: 30, reasons: ['research_incomplete'] },
  };
  return { nextAction: 'monitor', priority: { score: 0, reasons: ['monitoring_current'] } };
}

export function buildWatchlistWorkflowSummary(input: {
  item: WatchlistItem;
  research: WatchlistResearchBundle;
  alerts: WatchlistAlertEvent[];
  decisions: WatchlistItemDecisionHistory[];
  now?: Date;
  timeZone?: string;
}): WatchlistWorkflowSummary {
  const sourceCount = input.research.quality?.totalSources
    ?? input.research.news.items.length + input.research.reports.items.length;
  const eligibleSourceCount = input.research.quality?.eligibleSources ?? sourceCount;
  const researchStatus = sourceCount === 0
    ? 'unavailable' as const
    : eligibleSourceCount < sourceCount || input.research.news.meta?.status === 'partial'
      || input.research.reports.meta?.status === 'partial'
      ? 'limited' as const
      : 'ready' as const;
  const reviewBucket = watchlistReviewBucket(
    input.item,
    input.now ?? new Date(),
    input.timeZone ?? 'UTC',
  );
  const summary = {
    research: {
      status: researchStatus,
      sourceCount,
      eligibleSourceCount,
      perspectiveCount: input.research.perspectives.length,
      refreshedAt: input.research.refresh.refreshedAt,
    },
    alerts: {
      unread: input.alerts.filter((item) => item.read_at === null).length,
      failedDelivery: input.alerts.filter((item) => (
        item.delivery_status === 'failed' || item.delivery_status === 'dead_letter'
      )).length,
      latestTriggeredAt: latest(input.alerts.map((item) => item.triggered_at)),
    },
    review: {
      bucket: reviewBucket,
      due: reviewBucket === 'overdue' || reviewBucket === 'due_today',
    },
    decision: {
      status: input.item.status,
      version: input.item.decision_version,
      hasThesis: !!input.item.thesis?.trim(),
      lastChangedAt: latest(input.decisions.map((item) => item.changed_at)),
    },
  };
  return { ...summary, ...watchlistWorkflowPriority(summary, input.now ?? new Date()) };
}
