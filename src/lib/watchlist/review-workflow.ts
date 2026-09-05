import type { StockUniverse, WatchlistItem } from '@/lib/supabase/database.types';
import type { WatchlistOverviewGroupRow, WatchlistOverviewItemRow } from './overview-contract';

export const WATCHLIST_REVIEW_SCOPES = ['due', 'upcoming', 'unscheduled', 'all'] as const;
export type WatchlistReviewScope = typeof WATCHLIST_REVIEW_SCOPES[number];
export type WatchlistReviewBucket = 'overdue' | 'due_today' | 'upcoming' | 'scheduled' | 'unscheduled' | 'inactive';

export interface WatchlistReviewSummary {
  overdue: number;
  dueToday: number;
  upcoming: number;
  unscheduled: number;
}

export interface WatchlistReviewQueueRow {
  group: Omit<WatchlistOverviewGroupRow, 'watchlist_items'>;
  item: WatchlistOverviewItemRow;
  identity: StockUniverse | null;
  reviewBucket: Exclude<WatchlistReviewBucket, 'inactive'>;
}

export interface WatchlistReviewQueue {
  generatedAt: string;
  timezone: string;
  horizonDays: number;
  summary: WatchlistReviewSummary;
  rows: WatchlistReviewQueueRow[];
}

const INACTIVE_STATUSES = new Set<WatchlistItem['status']>(['paused', 'invalidated']);

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function reviewDateKey(value: string): string | null {
  if (!Number.isFinite(Date.parse(value))) return null;
  return value.slice(0, 10);
}

function addUtcDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function watchlistReviewBucket(
  item: Pick<WatchlistItem, 'review_at' | 'status'>,
  now = new Date(),
  timeZone = 'UTC',
  horizonDays = 7,
): WatchlistReviewBucket {
  if (INACTIVE_STATUSES.has(item.status)) return 'inactive';
  if (!item.review_at) return 'unscheduled';
  const reviewKey = reviewDateKey(item.review_at);
  if (!reviewKey) return 'unscheduled';
  const today = dateKeyInTimeZone(now, timeZone);
  if (reviewKey < today) return 'overdue';
  if (reviewKey === today) return 'due_today';
  return reviewKey <= addUtcDays(today, Math.max(0, horizonDays)) ? 'upcoming' : 'scheduled';
}

export function parseWatchlistReviewScope(value: string | null): WatchlistReviewScope | null {
  const scope = value ?? 'due';
  return WATCHLIST_REVIEW_SCOPES.includes(scope as WatchlistReviewScope) ? scope as WatchlistReviewScope : null;
}

export function parseWatchlistReviewQuery(url: URL): {
  scope: WatchlistReviewScope;
  horizonDays: number;
  limit: number;
} | null {
  const scope = parseWatchlistReviewScope(url.searchParams.get('scope'));
  const horizonDays = Number(url.searchParams.get('horizonDays') ?? 7);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  if (!scope || !Number.isSafeInteger(horizonDays) || horizonDays < 1 || horizonDays > 30
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return null;
  return { scope, horizonDays, limit };
}

export type WatchlistReviewActionCommand = {
  action: 'complete' | 'snooze';
  expectedVersion: number;
  reviewAt: string | null;
};

export function parseWatchlistReviewAction(
  value: unknown,
  now = new Date(),
): WatchlistReviewActionCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if ((input.action !== 'complete' && input.action !== 'snooze')
    || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 0) return null;
  const rawReviewAt = input.reviewAt;
  if (input.action === 'snooze' && typeof rawReviewAt !== 'string') return null;
  if (rawReviewAt !== undefined && rawReviewAt !== null
    && (typeof rawReviewAt !== 'string' || !Number.isFinite(Date.parse(rawReviewAt)))) return null;
  const reviewAt = typeof rawReviewAt === 'string' ? new Date(rawReviewAt).toISOString() : null;
  if (reviewAt && new Date(reviewAt).getTime() <= now.getTime()) return null;
  return { action: input.action, expectedVersion: Number(input.expectedVersion), reviewAt };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function parseWatchlistReviewQueue(value: unknown): WatchlistReviewQueue | null {
  const input = record(value);
  const summary = record(input?.summary);
  const rows = input?.rows;
  const overdue = nonNegativeInteger(summary?.overdue);
  const dueToday = nonNegativeInteger(summary?.due_today);
  const upcoming = nonNegativeInteger(summary?.upcoming);
  const unscheduled = nonNegativeInteger(summary?.unscheduled);
  if (!input || typeof input.generated_at !== 'string' || !Number.isFinite(Date.parse(input.generated_at))
    || typeof input.timezone !== 'string' || !Number.isSafeInteger(input.horizon_days)
    || overdue === null || dueToday === null || upcoming === null || unscheduled === null
    || !Array.isArray(rows)) return null;
  const parsedRows = rows.flatMap((candidate) => {
    const row = record(candidate);
    const group = record(row?.group);
    const item = record(row?.item);
    const identity = row?.identity;
    if (!group || typeof group.id !== 'string' || typeof group.name !== 'string'
      || !item || typeof item.id !== 'string' || typeof item.ticker !== 'string'
      || !['overdue', 'due_today', 'upcoming', 'scheduled', 'unscheduled'].includes(String(row?.review_bucket))
      || (identity !== null && !record(identity))) return [];
    return [{
      group: group as unknown as WatchlistReviewQueueRow['group'],
      item: item as unknown as WatchlistOverviewItemRow,
      identity: identity as StockUniverse | null,
      reviewBucket: row!.review_bucket as WatchlistReviewQueueRow['reviewBucket'],
    }];
  });
  if (parsedRows.length !== rows.length) return null;
  return {
    generatedAt: input.generated_at,
    timezone: input.timezone,
    horizonDays: Number(input.horizon_days),
    summary: { overdue, dueToday, upcoming, unscheduled },
    rows: parsedRows,
  };
}
