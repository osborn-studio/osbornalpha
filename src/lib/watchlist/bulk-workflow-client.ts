import type { NewWatchlistAlert } from '@/lib/hooks/useWatchlistAlerts';
import {
  parseWatchlistBulkWorkflowCommand,
  type WatchlistBulkWorkflowResult,
} from './bulk-workflow';

const PENDING_REQUEST_VERSION = 1;
const PENDING_REQUEST_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const PENDING_REQUEST_STORAGE_PREFIX = 'stock-monitor:watchlist:bulk-workflow:v1';

export interface WatchlistBulkPendingRequest {
  version: typeof PENDING_REQUEST_VERSION;
  requestId: string;
  command: WatchlistBulkClientCommand;
  createdAt: string;
}

export interface WatchlistBulkPendingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WatchlistBulkReviewTarget {
  itemId: string;
  expectedVersion: number;
}

export type WatchlistBulkClientCommand =
  | { operation: 'research'; tickers: string[] }
  | { operation: 'alert'; itemIds: string[]; rule: NewWatchlistAlert }
  | { operation: 'review'; targets: WatchlistBulkReviewTarget[]; action: 'complete' | 'snooze'; reviewAt: string | null };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function clientCommand(value: unknown, requestId: string, now: Date): WatchlistBulkClientCommand | null {
  const input = record(value);
  if (!input || !['research', 'alert', 'review'].includes(String(input.operation))) return null;
  const candidate = input as unknown as WatchlistBulkClientCommand;
  try {
    const parsed = parseWatchlistBulkWorkflowCommand({
      ...watchlistBulkCommandPayload(candidate),
      requestId,
    }, now);
    return parsed ? candidate : null;
  } catch {
    return null;
  }
}

export function createWatchlistBulkRequestId(operation: WatchlistBulkClientCommand['operation']): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `bulk-${operation}-${id}`;
}

export function watchlistBulkPendingStorageKey(ownerId: string): string {
  return `${PENDING_REQUEST_STORAGE_PREFIX}:${ownerId}`;
}

export function createWatchlistBulkPendingRequest(
  command: WatchlistBulkClientCommand,
  now = new Date(),
  requestId = createWatchlistBulkRequestId(command.operation),
): WatchlistBulkPendingRequest {
  return { version: PENDING_REQUEST_VERSION, requestId, command, createdAt: now.toISOString() };
}

export function parseWatchlistBulkPendingRequest(
  value: unknown,
  now = new Date(),
): WatchlistBulkPendingRequest | null {
  const input = record(value);
  if (input?.version !== PENDING_REQUEST_VERSION
    || typeof input.requestId !== 'string'
    || typeof input.createdAt !== 'string') return null;
  const createdAt = Date.parse(input.createdAt);
  if (!Number.isFinite(createdAt) || createdAt > now.getTime() + 60_000
    || now.getTime() - createdAt > PENDING_REQUEST_MAX_AGE_MS) return null;
  const command = clientCommand(input.command, input.requestId, now);
  return command ? {
    version: PENDING_REQUEST_VERSION,
    requestId: input.requestId,
    command,
    createdAt: new Date(createdAt).toISOString(),
  } : null;
}

export function loadWatchlistBulkPendingRequest(
  storage: WatchlistBulkPendingStorage,
  ownerId: string,
  now = new Date(),
): WatchlistBulkPendingRequest | null {
  const key = watchlistBulkPendingStorageKey(ownerId);
  const serialized = storage.getItem(key);
  if (!serialized) return null;
  try {
    const parsed = parseWatchlistBulkPendingRequest(JSON.parse(serialized), now);
    if (parsed) return parsed;
  } catch {}
  storage.removeItem(key);
  return null;
}

export function saveWatchlistBulkPendingRequest(
  storage: WatchlistBulkPendingStorage,
  ownerId: string,
  pending: WatchlistBulkPendingRequest,
): void {
  storage.setItem(watchlistBulkPendingStorageKey(ownerId), JSON.stringify(pending));
}

export function clearWatchlistBulkPendingRequest(
  storage: WatchlistBulkPendingStorage,
  ownerId: string,
  requestId?: string,
): void {
  const key = watchlistBulkPendingStorageKey(ownerId);
  if (requestId) {
    const current = loadWatchlistBulkPendingRequest(storage, ownerId);
    if (current?.requestId !== requestId) return;
  }
  storage.removeItem(key);
}

export function watchlistBulkCommandPayload(command: WatchlistBulkClientCommand): Record<string, unknown> {
  if (command.operation !== 'review') return command;
  return {
    operation: command.operation,
    targets: command.targets.map((target) => ({
      ...target,
      action: command.action,
      reviewAt: command.reviewAt,
    })),
  };
}

export function retryWatchlistBulkCommand(
  command: WatchlistBulkClientCommand,
  result: WatchlistBulkWorkflowResult,
): WatchlistBulkClientCommand | null {
  const retryable = new Map(result.results
    .filter((item) => (item.status === 'failed' || item.status === 'conflict') && item.retryable !== false)
    .map((item) => [item.key, item.value]));
  if (retryable.size === 0) return null;
  if (command.operation === 'research') {
    const tickers = command.tickers.filter((ticker) => retryable.has(ticker));
    return tickers.length > 0 ? { ...command, tickers } : null;
  }
  if (command.operation === 'alert') {
    const itemIds = command.itemIds.filter((itemId) => retryable.has(itemId));
    return itemIds.length > 0 ? { ...command, itemIds } : null;
  }
  const targets = command.targets.filter((target) => retryable.has(target.itemId)).map((target) => {
    const value = retryable.get(target.itemId);
    const version = value && typeof value === 'object' && !Array.isArray(value)
      && Number.isSafeInteger((value as Record<string, unknown>).decision_version)
      ? Number((value as Record<string, unknown>).decision_version)
      : target.expectedVersion;
    return { ...target, expectedVersion: version };
  });
  return targets.length > 0 ? { ...command, targets } : null;
}
