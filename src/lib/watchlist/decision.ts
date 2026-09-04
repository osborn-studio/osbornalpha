import type { WatchlistItem } from '@/lib/supabase/database.types';

export type WatchlistDecisionPatch = Partial<Pick<
  WatchlistItem,
  | 'conviction'
  | 'notes'
  | 'thesis'
  | 'target_price'
  | 'invalidation_conditions'
  | 'confidence'
  | 'review_at'
  | 'tags'
  | 'status'
>>;

const STATUSES = new Set<WatchlistItem['status']>([
  'inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated',
]);

function optionalText(value: unknown, maxLength: number): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized || null : false;
}

export function parseWatchlistDecisionPatch(body: unknown): WatchlistDecisionPatch | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const patch: WatchlistDecisionPatch = {};

  for (const [source, target, maxLength] of [
    ['notes', 'notes', 2_000],
    ['thesis', 'thesis', 4_000],
    ['invalidationConditions', 'invalidation_conditions', 2_000],
  ] as const) {
    const value = optionalText(input[source], maxLength);
    if (value === false) return null;
    if (value !== undefined) patch[target] = value;
  }

  if (input.targetPrice !== undefined) {
    if (input.targetPrice !== null && (typeof input.targetPrice !== 'number' || !Number.isFinite(input.targetPrice) || input.targetPrice <= 0)) return null;
    patch.target_price = input.targetPrice as number | null;
  }
  if (input.confidence !== undefined) {
    if (input.confidence !== null && (!Number.isInteger(input.confidence) || Number(input.confidence) < 0 || Number(input.confidence) > 100)) return null;
    patch.confidence = input.confidence as number | null;
  }
  if (input.conviction !== undefined) {
    if (!Number.isInteger(input.conviction) || Number(input.conviction) < 0 || Number(input.conviction) > 10) return null;
    patch.conviction = Number(input.conviction);
  }
  if (input.reviewAt !== undefined) {
    if (input.reviewAt !== null && (typeof input.reviewAt !== 'string' || !Number.isFinite(Date.parse(input.reviewAt)))) return null;
    patch.review_at = input.reviewAt === null ? null : new Date(input.reviewAt as string).toISOString();
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 20) return null;
    const tags = input.tags.map((tag) => typeof tag === 'string' ? tag.trim() : '');
    if (tags.some((tag) => !tag || tag.length > 32)) return null;
    patch.tags = Array.from(new Set(tags));
  }
  if (input.status !== undefined) {
    if (typeof input.status !== 'string' || !STATUSES.has(input.status as WatchlistItem['status'])) return null;
    patch.status = input.status as WatchlistItem['status'];
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function parseWatchlistDecisionCommand(body: unknown): {
  patch: WatchlistDecisionPatch;
  expectedVersion: number;
} | null {
  const patch = parseWatchlistDecisionPatch(body);
  if (!patch || !body || typeof body !== 'object' || Array.isArray(body)) return null;
  const expectedVersion = (body as Record<string, unknown>).expectedVersion;
  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0) return null;
  return { patch, expectedVersion: Number(expectedVersion) };
}
