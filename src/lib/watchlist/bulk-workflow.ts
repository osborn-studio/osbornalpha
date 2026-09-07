import { normalizeEvidenceTickerParam } from '@/lib/external-evidence/request';
import { parseCreateWatchlistAlert, type CreateWatchlistAlert } from './alerts';
import { parseWatchlistReviewAction, type WatchlistReviewActionCommand } from './review-workflow';

export const WATCHLIST_BULK_WORKFLOW_LIMIT = 20;
export const WATCHLIST_BULK_WORKFLOW_CONCURRENCY = 3;

export type WatchlistBulkWorkflowCommand =
  | { operation: 'research'; requestId: string; tickers: string[] }
  | { operation: 'alert'; requestId: string; itemIds: string[]; rule: Omit<CreateWatchlistAlert, 'watchlist_item_id'> }
  | { operation: 'review'; requestId: string; targets: Array<{ itemId: string; command: WatchlistReviewActionCommand }> };

export type WatchlistBulkItemStatus = 'succeeded' | 'unchanged' | 'conflict' | 'failed';

export interface WatchlistBulkItemResult<T = unknown> {
  key: string;
  status: WatchlistBulkItemStatus;
  code?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  value?: T;
}

export interface WatchlistBulkWorkflowResult<T = unknown> {
  requestId: string;
  operation: WatchlistBulkWorkflowCommand['operation'];
  total: number;
  succeeded: number;
  unchanged: number;
  conflicted: number;
  failed: number;
  results: Array<WatchlistBulkItemResult<T>>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9:_-]{8,128}$/.test(normalized) ? normalized : null;
}

function uniqueStrings(value: unknown, normalize: (item: string) => string | null): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > WATCHLIST_BULK_WORKFLOW_LIMIT) return null;
  const items: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'string') return null;
    const item = normalize(candidate);
    if (!item) return null;
    if (!seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }
  return items;
}

export function parseWatchlistBulkWorkflowCommand(
  value: unknown,
  now = new Date(),
): WatchlistBulkWorkflowCommand | null {
  const input = record(value);
  const id = requestId(input?.requestId);
  if (!input || !id) return null;

  if (input.operation === 'research') {
    const tickers = uniqueStrings(input.tickers, (ticker) => normalizeEvidenceTickerParam(ticker.trim()));
    return tickers ? { operation: 'research', requestId: id, tickers } : null;
  }

  if (input.operation === 'alert') {
    const itemIds = uniqueStrings(input.itemIds, (item) => item.trim() || null);
    const ruleInput = record(input.rule);
    if (!itemIds || !ruleInput) return null;
    const parsed = parseCreateWatchlistAlert({ ...ruleInput, itemId: itemIds[0] });
    if (!parsed) return null;
    const { watchlist_item_id: _itemId, ...rule } = parsed;
    return { operation: 'alert', requestId: id, itemIds, rule };
  }

  if (input.operation === 'review') {
    if (!Array.isArray(input.targets) || input.targets.length < 1
      || input.targets.length > WATCHLIST_BULK_WORKFLOW_LIMIT) return null;
    const targets: Array<{ itemId: string; command: WatchlistReviewActionCommand }> = [];
    const seen = new Set<string>();
    for (const candidate of input.targets) {
      const target = record(candidate);
      const itemId = typeof target?.itemId === 'string' ? target.itemId.trim() : '';
      const command = parseWatchlistReviewAction(target, now);
      if (!itemId || !command) return null;
      if (!seen.has(itemId)) {
        seen.add(itemId);
        targets.push({ itemId, command });
      }
    }
    return { operation: 'review', requestId: id, targets };
  }

  return null;
}

export async function runWatchlistBatch<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = WATCHLIST_BULK_WORKFLOW_CONCURRENCY,
): Promise<R[]> {
  const limit = Math.min(Math.max(Math.floor(concurrency), 1), WATCHLIST_BULK_WORKFLOW_CONCURRENCY);
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

export function summarizeWatchlistBulkWorkflow<T>(
  command: WatchlistBulkWorkflowCommand,
  results: Array<WatchlistBulkItemResult<T>>,
): WatchlistBulkWorkflowResult<T> {
  const count = (status: WatchlistBulkItemStatus) => results.filter((result) => result.status === status).length;
  return {
    requestId: command.requestId,
    operation: command.operation,
    total: results.length,
    succeeded: count('succeeded'),
    unchanged: count('unchanged'),
    conflicted: count('conflict'),
    failed: count('failed'),
    results,
  };
}

export function parseWatchlistBulkWorkflowResult(value: unknown): WatchlistBulkWorkflowResult | null {
  const input = record(value);
  if (!input || !requestId(input.requestId)
    || !['research', 'alert', 'review'].includes(String(input.operation))
    || !Array.isArray(input.results)) return null;
  const results = input.results.flatMap((candidate): WatchlistBulkItemResult[] => {
    const result = record(candidate);
    if (!result || typeof result.key !== 'string' || !result.key.trim()
      || !['succeeded', 'unchanged', 'conflict', 'failed'].includes(String(result.status))
      || (result.code !== undefined && typeof result.code !== 'string')
      || (result.retryable !== undefined && typeof result.retryable !== 'boolean')
      || (result.details !== undefined && !record(result.details))) return [];
    return [{
      key: result.key,
      status: result.status as WatchlistBulkItemStatus,
      ...(typeof result.code === 'string' ? { code: result.code } : {}),
      ...(typeof result.retryable === 'boolean' ? { retryable: result.retryable } : {}),
      ...(record(result.details) ? { details: record(result.details)! } : {}),
      ...(result.value !== undefined ? { value: result.value } : {}),
    }];
  });
  if (results.length !== input.results.length) return null;
  const summary = summarizeWatchlistBulkWorkflow({
    operation: input.operation as 'research',
    requestId: input.requestId as string,
    tickers: [],
  }, results);
  if (input.total !== summary.total || input.succeeded !== summary.succeeded
    || input.unchanged !== summary.unchanged || input.conflicted !== summary.conflicted
    || input.failed !== summary.failed) return null;
  return { ...summary, operation: input.operation as WatchlistBulkWorkflowResult['operation'] };
}
