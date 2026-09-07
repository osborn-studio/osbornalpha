'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NewWatchlistAlert } from './useWatchlistAlerts';
import { useAppSession } from '@/components/AppSessionProvider';
import { WatchlistRequestError, watchlistJsonRequest } from '@/lib/watchlist/api-client';
import {
  parseWatchlistBulkWorkflowResult,
  type WatchlistBulkWorkflowResult,
} from '@/lib/watchlist/bulk-workflow';
import {
  clearWatchlistBulkPendingRequest,
  createWatchlistBulkPendingRequest,
  loadWatchlistBulkPendingRequest,
  retryWatchlistBulkCommand,
  saveWatchlistBulkPendingRequest,
  watchlistBulkCommandPayload,
  type WatchlistBulkClientCommand as PendingCommand,
  type WatchlistBulkPendingRequest,
  type WatchlistBulkReviewTarget,
} from '@/lib/watchlist/bulk-workflow-client';

export function useWatchlistBulkWorkflow(onCompleted?: (result: WatchlistBulkWorkflowResult) => void | Promise<void>) {
  const { user } = useAppSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WatchlistBulkWorkflowResult | null>(null);
  const [lastCommand, setLastCommand] = useState<PendingCommand | null>(null);
  const [pendingRequest, setPendingRequest] = useState<WatchlistBulkPendingRequest | null>(null);
  const restoredOwner = useRef<string | null>(null);

  const run = useCallback(async (pending: WatchlistBulkPendingRequest) => {
    setSaving(true);
    setError(null);
    setLastCommand(pending.command);
    setPendingRequest(pending);
    try {
      const body = await watchlistJsonRequest<unknown>('/api/watchlist/workflows/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...watchlistBulkCommandPayload(pending.command),
          requestId: pending.requestId,
        }),
      }, 'watchlist_bulk_workflow_failed');
      const parsed = parseWatchlistBulkWorkflowResult(body);
      if (!parsed) throw new Error('watchlist_bulk_workflow_invalid_response');
      if (user && typeof window !== 'undefined') {
        clearWatchlistBulkPendingRequest(window.sessionStorage, user.id, pending.requestId);
      }
      setPendingRequest(null);
      setResult(parsed);
      try { await onCompleted?.(parsed); } catch {}
      return parsed;
    } catch (caught) {
      if (caught instanceof WatchlistRequestError && !caught.retryable
        && caught.status >= 400 && caught.status < 500) {
        if (user && typeof window !== 'undefined') {
          clearWatchlistBulkPendingRequest(window.sessionStorage, user.id, pending.requestId);
        }
        setPendingRequest(null);
      }
      setError(caught instanceof Error ? caught.message : 'watchlist_bulk_workflow_failed');
      return null;
    } finally {
      setSaving(false);
    }
  }, [onCompleted, user]);

  const execute = useCallback(async (command: PendingCommand) => {
    const pending = createWatchlistBulkPendingRequest(command);
    if (user && typeof window !== 'undefined') {
      saveWatchlistBulkPendingRequest(window.sessionStorage, user.id, pending);
    }
    return run(pending);
  }, [run, user]);

  useEffect(() => {
    if (!user) {
      restoredOwner.current = null;
      setPendingRequest(null);
      return;
    }
    if (typeof window === 'undefined' || restoredOwner.current === user.id) return;
    restoredOwner.current = user.id;
    const pending = loadWatchlistBulkPendingRequest(window.sessionStorage, user.id);
    if (pending) void run(pending);
  }, [run, user]);

  const research = useCallback((tickers: string[]) => execute({ operation: 'research', tickers }), [execute]);
  const alert = useCallback((itemIds: string[], rule: NewWatchlistAlert) => execute({ operation: 'alert', itemIds, rule }), [execute]);
  const review = useCallback((
    targets: WatchlistBulkReviewTarget[],
    action: 'complete' | 'snooze',
    reviewAt: string | null,
  ) => execute({ operation: 'review', targets, action, reviewAt }), [execute]);
  const retry = useCallback(() => {
    if (!lastCommand || !result) return Promise.resolve(null);
    const command = retryWatchlistBulkCommand(lastCommand, result);
    return command ? execute(command) : Promise.resolve(null);
  }, [execute, lastCommand, result]);
  const resume = useCallback(
    () => pendingRequest ? run(pendingRequest) : Promise.resolve(null),
    [pendingRequest, run],
  );
  const canRetry = !!lastCommand && !!result?.results.some((item) => (
    item.status === 'failed' || item.status === 'conflict'
  ) && item.retryable !== false);
  const canResume = !!pendingRequest && !!error;
  const reset = useCallback(() => { setError(null); setResult(null); setLastCommand(null); }, []);

  return { saving, error, result, canRetry, canResume, research, alert, review, retry, resume, reset };
}
