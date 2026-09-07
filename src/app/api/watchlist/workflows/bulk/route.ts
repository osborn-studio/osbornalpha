import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { parseWatchlistBulkWorkflowCommand } from '@/lib/watchlist/bulk-workflow';
import { executeIdempotentWatchlistBulkWorkflow } from '@/lib/watchlist/bulk-workflow-service';
import { WatchlistBulkWorkflowRunError } from '@/lib/watchlist/bulk-workflow-run-repository';
import {
  logRequestEvent,
  requestErrorCode,
  requestRunDuration,
  runRequestStep,
  startRequestRun,
} from '@/lib/observability/request-run';
import { consumeWatchlistApiRateLimit } from '@/lib/watchlist/api-rate-limit';

export async function POST(request: Request) {
  const command = parseWatchlistBulkWorkflowCommand(await request.json().catch(() => null));
  const run = startRequestRun('watchlist_bulk_workflow', request.method, Date.now(), command?.requestId);
  const apiError = (
    code: string,
    status: number,
    options: Parameters<typeof watchlistApiError>[2] = {},
  ) => watchlistApiError(code, status, { ...options, requestId: run.requestId });
  if (!serverIsSupabaseConfigured()) return apiError('supabase_unavailable', 503);
  if (!command) return apiError('invalid_bulk_workflow_command', 400);
  try {
    const client = await getServerSupabase(request);
    const { data: { user } } = await runRequestStep(run, 'authenticate', () => client.auth.getUser());
    if (!user) {
      logRequestEvent('warn', 'request_complete', run, {
        status: 401, duration_ms: requestRunDuration(run), operation: command.operation,
      });
      return apiError('not_authenticated', 401);
    }
    const rateLimit = await runRequestStep(run, 'rate_limit', () => consumeWatchlistApiRateLimit(client, 'bulk'));
    if (!rateLimit.allowed) {
      logRequestEvent('warn', 'request_complete', run, {
        status: 429, duration_ms: requestRunDuration(run), operation: command.operation,
      });
      return apiError('watchlist_rate_limited', 429, {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        details: { limit: rateLimit.limit, remaining: rateLimit.remaining },
      });
    }
    const result = await runRequestStep(run, 'execute_workflow', () => (
      executeIdempotentWatchlistBulkWorkflow(client, user.id, command)
    ));
    const partial = result.failed > 0 || result.conflicted > 0;
    logRequestEvent(partial ? 'warn' : 'info', 'request_complete', run, {
      status: partial ? 207 : 200,
      duration_ms: requestRunDuration(run),
      operation: result.operation,
      total: result.total,
      failed: result.failed,
      conflicted: result.conflicted,
    });
    return NextResponse.json(result, {
      status: partial ? 207 : 200,
      headers: { 'x-request-id': run.requestId },
    });
  } catch (error) {
    const conflict = error instanceof WatchlistBulkWorkflowRunError
      && (error.code === 'watchlist_bulk_workflow_request_conflict'
        || error.code === 'watchlist_bulk_workflow_in_progress');
    logRequestEvent('error', 'request_failed', run, {
      status: conflict ? 409 : 503,
      duration_ms: requestRunDuration(run),
      error_code: requestErrorCode(error, 'watchlist_bulk_workflow_failed'),
      operation: command.operation,
    });
    if (error instanceof WatchlistBulkWorkflowRunError) {
      if (error.code === 'watchlist_bulk_workflow_request_conflict') {
        return apiError(error.code, 409);
      }
      if (error.code === 'watchlist_bulk_workflow_in_progress') {
        return apiError(error.code, 409, { retryAfterSeconds: 2, retryable: true });
      }
    }
    return apiError('watchlist_bulk_workflow_persistence_failed', 503, { retryAfterSeconds: 5 });
  }
}
