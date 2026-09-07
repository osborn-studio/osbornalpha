import { createHash } from 'node:crypto';
import type { WatchlistBulkWorkflowCommand, WatchlistBulkWorkflowResult } from './bulk-workflow';
import { parseWatchlistBulkWorkflowResult } from './bulk-workflow';

export type WatchlistBulkWorkflowRunDatabase = object;

export type WatchlistBulkWorkflowClaim =
  | { state: 'acquired'; runId: string; leaseToken: string }
  | { state: 'replay'; runId: string; result: WatchlistBulkWorkflowResult }
  | { state: 'conflict'; runId: string }
  | { state: 'in_progress'; runId: string };

export class WatchlistBulkWorkflowRunError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'WatchlistBulkWorkflowRunError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = record(value);
  if (object) {
    return `{${Object.keys(object).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(object[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function watchlistBulkWorkflowFingerprint(command: WatchlistBulkWorkflowCommand): string {
  const { requestId: _requestId, ...payload } = command;
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export async function beginWatchlistBulkWorkflowRun(
  db: WatchlistBulkWorkflowRunDatabase,
  command: WatchlistBulkWorkflowCommand,
): Promise<WatchlistBulkWorkflowClaim> {
  const repository = db as {
    rpc(name: 'begin_watchlist_bulk_workflow', args: {
      p_request_id: string;
      p_request_hash: string;
      p_operation: WatchlistBulkWorkflowCommand['operation'];
      p_lease_minutes: number;
    }): Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await repository.rpc('begin_watchlist_bulk_workflow', {
    p_request_id: command.requestId,
    p_request_hash: watchlistBulkWorkflowFingerprint(command),
    p_operation: command.operation,
    p_lease_minutes: 5,
  });
  if (error) throw new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_begin_failed');
  const input = record(data);
  const state = typeof input?.state === 'string' ? input.state : '';
  const runId = typeof input?.runId === 'string' ? input.runId : null;
  if (!input || !runId || !['acquired', 'replay', 'conflict', 'in_progress'].includes(state)) {
    throw new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_claim_invalid');
  }
  if (state === 'acquired') {
    if (typeof input.leaseToken !== 'string') {
      throw new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_claim_invalid');
    }
    return { state, runId, leaseToken: input.leaseToken };
  }
  if (state === 'replay') {
    const result = parseWatchlistBulkWorkflowResult(input.result);
    if (!result) throw new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_replay_invalid');
    return { state, runId, result };
  }
  if (state === 'conflict') return { state, runId };
  if (state === 'in_progress') return { state, runId };
  throw new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_claim_invalid');
}

export async function finishWatchlistBulkWorkflowRun(
  db: WatchlistBulkWorkflowRunDatabase,
  runId: string,
  leaseToken: string,
  result: WatchlistBulkWorkflowResult,
): Promise<void> {
  const repository = db as {
    rpc(name: 'finish_watchlist_bulk_workflow', args: {
      p_run_id: string;
      p_lease_token: string;
      p_result: WatchlistBulkWorkflowResult;
    }): Promise<{ data: boolean | null; error: { message: string } | null }>;
  };
  const response = await repository.rpc('finish_watchlist_bulk_workflow', {
    p_run_id: runId,
    p_lease_token: leaseToken,
    p_result: result,
  });
  if (response.error || response.data !== true) {
    throw new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_finish_failed');
  }
}
