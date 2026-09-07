import type { WatchlistAlert, WatchlistItem } from '@/lib/supabase/database.types';
import { createWatchlistAlert } from './alert-repository';
import { executeWatchlistReview, type WatchlistDecisionResult } from './decision-service';
import { isWatchlistPlanLimitError } from './plan-limits';
import { enqueueWatchlistResearchRefresh } from './research-command-service';
import { WatchlistResearchJobRepositoryError } from './research-job-repository';
import { watchlistResearchJobView, type WatchlistResearchJobView } from './research-job-contract';
import type { WatchlistServerClient } from './server-repository';
import {
  runWatchlistBatch,
  summarizeWatchlistBulkWorkflow,
  type WatchlistBulkItemResult,
  type WatchlistBulkWorkflowCommand,
  type WatchlistBulkWorkflowResult,
} from './bulk-workflow';
import {
  beginWatchlistBulkWorkflowRun,
  finishWatchlistBulkWorkflowRun,
  WatchlistBulkWorkflowRunError,
} from './bulk-workflow-run-repository';

export type WatchlistBulkWorkflowValue = WatchlistResearchJobView | WatchlistAlert | WatchlistItem;

interface Dependencies {
  enqueueResearch: typeof enqueueWatchlistResearchRefresh;
  createAlert: typeof createWatchlistAlert;
  executeReview: typeof executeWatchlistReview;
}

const DEFAULT_DEPENDENCIES: Dependencies = {
  enqueueResearch: enqueueWatchlistResearchRefresh,
  createAlert: createWatchlistAlert,
  executeReview: executeWatchlistReview,
};

function researchError(key: string, error: unknown): WatchlistBulkItemResult<WatchlistBulkWorkflowValue> {
  if (error instanceof WatchlistResearchJobRepositoryError) {
    const code = error.code === 'watchlist_research_rate_limit' ? 'rate_limited' : error.code;
    return {
      key,
      status: 'failed',
      code,
      retryable: error.code === 'watchlist_research_rate_limit'
        || error.code === 'watchlist_research_job_enqueue_failed',
      ...(error.quota ? { details: { quota: error.quota } } : {}),
    };
  }
  return { key, status: 'failed', code: 'research_refresh_failed', retryable: true };
}

function sameInstant(left: string | null, right: string | null): boolean {
  if (left === right) return true;
  return !!left && !!right && Date.parse(left) === Date.parse(right);
}

function reviewResult(
  key: string,
  command: Extract<WatchlistBulkWorkflowCommand, { operation: 'review' }>['targets'][number]['command'],
  result: WatchlistDecisionResult,
): WatchlistBulkItemResult<WatchlistBulkWorkflowValue> {
  if (result.status === 'updated') return { key, status: 'succeeded', value: result.item };
  if (result.status === 'not_found') return { key, status: 'failed', code: 'watchlist_item_not_found', retryable: false };
  if (result.status === 'failed') return { key, status: 'failed', code: 'watchlist_review_update_failed', retryable: true };
  if (command.action === 'snooze' && result.currentItem
    && sameInstant(result.currentItem.review_at, command.reviewAt)) {
    return { key, status: 'unchanged', value: result.currentItem };
  }
  return {
    key,
    status: 'conflict',
    code: 'watchlist_decision_conflict',
    retryable: true,
    ...(result.currentItem ? { value: result.currentItem } : {}),
  };
}

export async function executeWatchlistBulkWorkflow(
  client: WatchlistServerClient,
  userId: string,
  command: WatchlistBulkWorkflowCommand,
  dependencies: Dependencies = DEFAULT_DEPENDENCIES,
): Promise<WatchlistBulkWorkflowResult<WatchlistBulkWorkflowValue>> {
  if (command.operation === 'research') {
    const results = await runWatchlistBatch(command.tickers, async (ticker) => {
      try {
        const job = await dependencies.enqueueResearch(client, userId, ticker);
        return { key: ticker, status: 'succeeded', value: watchlistResearchJobView(job) } as const;
      } catch (error) {
        return researchError(ticker, error);
      }
    });
    return summarizeWatchlistBulkWorkflow(command, results);
  }

  if (command.operation === 'alert') {
    const results = await runWatchlistBatch(command.itemIds, async (itemId) => {
      try {
        const { data, error } = await dependencies.createAlert(client, userId, {
          watchlist_item_id: itemId,
          ...command.rule,
        });
        if (error?.code === '23505') {
          return { key: itemId, status: 'unchanged', code: 'alert_already_exists', retryable: false } as const;
        }
        if (isWatchlistPlanLimitError(error, 'alert')) {
          return { key: itemId, status: 'failed', code: 'watchlist_alert_plan_limit', retryable: false } as const;
        }
        if (error || !data) {
          return { key: itemId, status: 'failed', code: 'watchlist_alert_create_failed', retryable: true } as const;
        }
        return { key: itemId, status: 'succeeded', value: data } as const;
      } catch {
        return { key: itemId, status: 'failed', code: 'watchlist_alert_create_failed', retryable: true } as const;
      }
    });
    return summarizeWatchlistBulkWorkflow(command, results);
  }

  const results = await runWatchlistBatch(command.targets, async (target) => {
    try {
      return reviewResult(
        target.itemId,
        target.command,
        await dependencies.executeReview(client, userId, target.itemId, target.command),
      );
    } catch {
      return { key: target.itemId, status: 'failed', code: 'watchlist_review_update_failed', retryable: true } as const;
    }
  });
  return summarizeWatchlistBulkWorkflow(command, results);
}

export async function executeIdempotentWatchlistBulkWorkflow(
  client: WatchlistServerClient,
  userId: string,
  command: WatchlistBulkWorkflowCommand,
  idempotency: {
    begin: typeof beginWatchlistBulkWorkflowRun;
    finish: typeof finishWatchlistBulkWorkflowRun;
    execute: typeof executeWatchlistBulkWorkflow;
  } = {
    begin: beginWatchlistBulkWorkflowRun,
    finish: finishWatchlistBulkWorkflowRun,
    execute: executeWatchlistBulkWorkflow,
  },
): Promise<WatchlistBulkWorkflowResult<WatchlistBulkWorkflowValue>> {
  const claim = await idempotency.begin(client, command);
  if (claim.state === 'replay') {
    return claim.result as WatchlistBulkWorkflowResult<WatchlistBulkWorkflowValue>;
  }
  if (claim.state === 'conflict') {
    throw new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_request_conflict');
  }
  if (claim.state === 'in_progress') {
    throw new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_in_progress');
  }
  const result = await idempotency.execute(client, userId, command);
  await idempotency.finish(client, claim.runId, claim.leaseToken, result);
  return result;
}
