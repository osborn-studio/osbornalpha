import { buildCalendar, type CalendarPayload } from '@/lib/brief/calendar';
import type { PerspectiveRow } from '@/lib/hooks/useQuote';
import type { WatchlistItem } from '@/lib/supabase/database.types';
import { listWatchlistAlertEvents } from './alert-repository';
import { loadWatchlistActivityState } from './activity-repository';
import { loadPerspectiveAssessments } from './perspective-feedback';
import { loadWatchlistResearchBundle, type WatchlistResearchBundle } from './research-service';
import { buildWatchlistResearchTimeline, type WatchlistResearchTimelineItem } from './research-timeline';
import { loadWatchlistItemByTicker, loadWatchlistItemDecisionHistory, type WatchlistServerClient } from './server-repository';

export interface WatchlistActivityBundle extends WatchlistResearchBundle {
  timeline: WatchlistResearchTimelineItem[];
  activity: {
    generatedAt: string;
    lastSeenAt: string | null;
    unseenCount: number;
    warnings: string[];
  };
}

export interface ActivityDependencies {
  loadResearch: typeof loadWatchlistResearchBundle;
  loadCalendar: (ticker: string, horizonDays: number) => Promise<CalendarPayload>;
  loadItem: typeof loadWatchlistItemByTicker;
  loadHistory: typeof loadWatchlistItemDecisionHistory;
  loadAlerts: typeof listWatchlistAlertEvents;
  loadState: typeof loadWatchlistActivityState;
  loadAssessments: typeof loadPerspectiveAssessments;
  now: () => Date;
}

const productionDependencies: ActivityDependencies = {
  loadResearch: loadWatchlistResearchBundle,
  loadCalendar: buildCalendar,
  loadItem: loadWatchlistItemByTicker,
  loadHistory: loadWatchlistItemDecisionHistory,
  loadAlerts: listWatchlistAlertEvents,
  loadState: loadWatchlistActivityState,
  loadAssessments: loadPerspectiveAssessments,
  now: () => new Date(),
};

function assessedPerspectives(
  perspectives: PerspectiveRow[],
  assessments: Awaited<ReturnType<typeof loadPerspectiveAssessments>>,
): PerspectiveRow[] {
  return perspectives.map((item) => {
    const assessment = item.id ? assessments[item.id] : null;
    return {
      ...item,
      feedback: assessment?.feedback ? {
        verdict: assessment.feedback.verdict,
        reason: assessment.feedback.reason,
        correctedStance: assessment.feedback.corrected_stance,
      } : null,
      outcomes: (assessment?.outcomes ?? []).map((outcome) => ({
        horizonDays: outcome.horizon_days,
        returnPct: outcome.return_pct,
        directionCorrect: outcome.direction_correct,
        evaluatedAt: outcome.evaluated_at,
      })),
    };
  });
}

function unseenCount(timeline: WatchlistResearchTimelineItem[], lastSeenAt: string | null, generatedAt: string): number {
  return timeline.filter((item) => item.at !== null
    && item.at <= generatedAt
    && (lastSeenAt === null || item.at > lastSeenAt)).length;
}

export async function loadWatchlistActivityBundle(
  client: WatchlistServerClient,
  userId: string,
  ticker: string,
  dependencies: ActivityDependencies = productionDependencies,
): Promise<WatchlistActivityBundle> {
  const itemResult = await dependencies.loadItem(client, userId, ticker);
  if (itemResult.error) throw new Error(`watchlist_item_load_failed:${itemResult.error.message}`);
  if (!itemResult.data) throw new Error('watchlist_item_not_found');
  const item = itemResult.data as WatchlistItem;
  const warnings: string[] = [];
  const [research, historyResult, alertsResult, calendar, activityState] = await Promise.all([
    dependencies.loadResearch(client, userId, ticker),
    dependencies.loadHistory(client, userId, item.id, 50),
    dependencies.loadAlerts(client, userId, { itemId: item.id, unreadOnly: false, limit: 100 }),
    dependencies.loadCalendar(ticker, 90).catch(() => {
      warnings.push('calendar_unavailable');
      return null;
    }),
    dependencies.loadState(client, userId, ticker).catch(() => {
      warnings.push('activity_state_unavailable');
      return null;
    }),
  ]);
  if (historyResult.error) warnings.push('decision_history_unavailable');
  if (alertsResult.error) warnings.push('alert_events_unavailable');
  const assessments = await dependencies.loadAssessments(
    client,
    userId,
    research.perspectives.flatMap((item) => item.id ? [item.id] : []),
  ).catch(() => {
    warnings.push('perspective_assessments_unavailable');
    return {};
  });
  const perspectives = assessedPerspectives(research.perspectives, assessments);
  const timeline = buildWatchlistResearchTimeline({
    news: research.news.items,
    reports: research.reports.items,
    perspectives,
    perspectivesGeneratedAt: research.perspectivesGeneratedAt,
    calendar: (calendar?.events ?? []).map((event) => ({
      kind: event.kind,
      date: event.date,
      title: event.title,
      daysUntil: event.days_until,
    })),
    decisions: historyResult.data ?? [],
    alerts: alertsResult.data ?? [],
  });
  const generatedAt = dependencies.now().toISOString();
  const lastSeenAt = activityState?.last_seen_at ?? null;
  return {
    ...research,
    perspectives,
    timeline,
    activity: {
      generatedAt,
      lastSeenAt,
      unseenCount: unseenCount(timeline, lastSeenAt, generatedAt),
      warnings,
    },
  };
}
