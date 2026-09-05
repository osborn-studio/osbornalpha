import type { PerspectiveRow } from '@/lib/hooks/useQuote';
import type { StockNewsItem, StockReportItem } from '@/lib/stocks/research-types';
import type { WatchlistAlertEvent, WatchlistItemDecisionHistory } from '@/lib/supabase/database.types';

export type WatchlistResearchTimelineKind =
  | 'news'
  | 'filing'
  | 'report'
  | 'perspective'
  | 'calendar'
  | 'decision'
  | 'alert';

export interface WatchlistResearchTimelineItem {
  id: string;
  kind: WatchlistResearchTimelineKind;
  at: string | null;
  title: string;
  source: string;
  url: string | null;
  sentiment: number | null;
  stance: PerspectiveRow['stance'] | null;
  confidence: number | null;
  detail: string | null;
  read: boolean | null;
}

export interface WatchlistResearchChanges {
  hasChanges: boolean;
  newNews: number;
  newReports: number;
  perspectivesChanged: boolean;
  ratingChanges: Array<{ broker: string; from: string; to: string }>;
}

interface ResearchTimelineInput {
  news: StockNewsItem[];
  reports: StockReportItem[];
  perspectives: PerspectiveRow[];
  perspectivesGeneratedAt: string | null;
  calendar?: Array<{ kind: string; date: string; title: string; daysUntil?: number }>;
  decisions?: WatchlistItemDecisionHistory[];
  alerts?: WatchlistAlertEvent[];
}

function calendarTimestamp(value: string): string | null {
  const normalized = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
  const timestamp = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function decisionDetail(entry: WatchlistItemDecisionHistory): string | null {
  const keys = [...new Set([...Object.keys(entry.before_value), ...Object.keys(entry.after_value)])]
    .filter((key) => JSON.stringify(entry.before_value[key] ?? null) !== JSON.stringify(entry.after_value[key] ?? null));
  return keys.length > 0 ? keys.join(', ') : null;
}

export function buildWatchlistResearchTimeline(input: ResearchTimelineInput): WatchlistResearchTimelineItem[] {
  return [
    ...input.news.map((item): WatchlistResearchTimelineItem => ({
      id: `news:${item.id}`,
      kind: item.sourceType === 'filing' ? 'filing' : 'news',
      at: item.publishedAt ?? item.fetchedAt,
      title: item.title,
      source: item.source,
      url: item.url,
      sentiment: item.sentiment,
      stance: null,
      confidence: item.sentimentConfidence ?? null,
      detail: item.snippet || null,
      read: null,
    })),
    ...input.reports.map((item): WatchlistResearchTimelineItem => ({
      id: `report:${item.id}`,
      kind: 'report',
      at: item.publishedAt,
      title: item.title,
      source: item.broker ?? item.source,
      url: item.url,
      sentiment: null,
      stance: null,
      confidence: null,
      detail: item.rating ?? null,
      read: null,
    })),
    ...input.perspectives.map((item): WatchlistResearchTimelineItem => ({
      id: `perspective:${item.id ?? `${input.perspectivesGeneratedAt ?? 'unknown'}:${item.persona}`}`,
      kind: 'perspective',
      at: input.perspectivesGeneratedAt,
      title: item.summary,
      source: item.name,
      url: null,
      sentiment: null,
      stance: item.stance,
      confidence: item.confidence,
      detail: item.cites.join(', ') || null,
      read: null,
    })),
    ...(input.calendar ?? []).map((item, index): WatchlistResearchTimelineItem => ({
      id: `calendar:${item.kind}:${item.date}:${index}`,
      kind: 'calendar',
      at: calendarTimestamp(item.date),
      title: item.title,
      source: item.kind,
      url: null,
      sentiment: null,
      stance: null,
      confidence: null,
      detail: item.daysUntil == null ? null : String(item.daysUntil),
      read: null,
    })),
    ...(input.decisions ?? []).map((item): WatchlistResearchTimelineItem => ({
      id: `decision:${item.id}`,
      kind: 'decision',
      at: item.changed_at,
      title: `Decision v${item.version}`,
      source: 'watchlist',
      url: null,
      sentiment: null,
      stance: null,
      confidence: null,
      detail: decisionDetail(item),
      read: null,
    })),
    ...(input.alerts ?? []).map((item): WatchlistResearchTimelineItem => ({
      id: `alert:${item.id}`,
      kind: 'alert',
      at: item.triggered_at,
      title: typeof item.payload.label === 'string' ? item.payload.label : item.alert_type,
      source: item.alert_type,
      url: null,
      sentiment: null,
      stance: null,
      confidence: null,
      detail: item.delivery_status,
      read: item.read_at !== null,
    })),
  ].sort((left, right) => (right.at ?? '').localeCompare(left.at ?? '') || left.id.localeCompare(right.id));
}

export function summarizeWatchlistResearchChanges(
  before: ResearchTimelineInput,
  after: ResearchTimelineInput,
): WatchlistResearchChanges {
  const previousNews = new Set(before.news.map((item) => item.id));
  const previousReports = new Set(before.reports.map((item) => item.id));
  const addedReports = after.reports.filter((item) => !previousReports.has(item.id));
  const latestRatingByBroker = new Map<string, string>();
  [...before.reports]
    .sort((left, right) => (right.publishedAt ?? '').localeCompare(left.publishedAt ?? ''))
    .forEach((item) => {
      const broker = item.broker?.trim().toLocaleLowerCase();
      const rating = item.ratingNormalized ?? 'unknown';
      if (broker && rating !== 'unknown' && !latestRatingByBroker.has(broker)) latestRatingByBroker.set(broker, rating);
    });
  const ratingChanges = addedReports.flatMap((item) => {
    const brokerKey = item.broker?.trim().toLocaleLowerCase();
    const next = item.ratingNormalized ?? 'unknown';
    const previous = brokerKey ? latestRatingByBroker.get(brokerKey) : null;
    return item.broker && previous && next !== 'unknown' && previous !== next
      ? [{ broker: item.broker, from: previous, to: next }]
      : [];
  });
  const newNews = after.news.filter((item) => !previousNews.has(item.id)).length;
  const newReports = addedReports.length;
  const perspectivesChanged = after.perspectivesGeneratedAt !== null
    && after.perspectivesGeneratedAt !== before.perspectivesGeneratedAt;
  return {
    hasChanges: newNews > 0 || newReports > 0 || perspectivesChanged || ratingChanges.length > 0,
    newNews,
    newReports,
    perspectivesChanged,
    ratingChanges,
  };
}
