import type { WatchlistItemDecisionHistory } from '@/lib/supabase/database.types';
import { parseWatchlistDecisionCommand } from './decision';

const LABELLED_FIELDS = [
  'conviction', 'notes', 'thesis', 'target_price', 'invalidation_conditions',
  'confidence', 'review_at', 'tags', 'status',
] as const;

export type WatchlistDecisionField = typeof LABELLED_FIELDS[number];

function equivalent(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function changedDecisionFields(entry: WatchlistItemDecisionHistory): WatchlistDecisionField[] {
  return LABELLED_FIELDS.filter((field) => !equivalent(entry.before_value[field], entry.after_value[field]));
}

export function decisionRestoreRequest(
  entry: WatchlistItemDecisionHistory,
  expectedVersion: number,
): Record<string, unknown> | null {
  const value = entry.after_value;
  const request: Record<string, unknown> = {
    expectedVersion,
    conviction: value.conviction,
    notes: value.notes,
    thesis: value.thesis,
    targetPrice: value.target_price,
    invalidationConditions: value.invalidation_conditions,
    confidence: value.confidence,
    reviewAt: value.review_at,
    tags: value.tags,
    status: value.status,
  };
  for (const key of Object.keys(request)) {
    if (request[key] === undefined) delete request[key];
  }
  return parseWatchlistDecisionCommand(request) ? request : null;
}
