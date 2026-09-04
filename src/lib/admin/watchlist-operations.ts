export interface WatchlistAlertRunInput {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  evaluated: number;
  triggered: number;
  unavailable: number;
  delivery_claimed: number;
  delivery_delivered: number;
  delivery_failed: number;
  delivery_dead_letter: number;
  delivery_skipped: number;
  delivery_deferred?: number;
  saturated: boolean;
  error: string | null;
}

export interface WatchlistOperationsInput {
  now: string;
  alertRuns: WatchlistAlertRunInput[];
  eventCounts: Record<'pending' | 'processing' | 'failed' | 'dead_letter', number>;
  researchDue: number;
  researchFailed: number;
}

export type WatchlistOperationAction =
  | 'retry_failed_delivery'
  | 'retry_dead_letter'
  | 'release_stale_processing'
  | 'retry_failed_research';

export interface WatchlistOperationCommand {
  action: WatchlistOperationAction;
  limit: number;
  olderThanMinutes: number;
  tickers: string[];
}

const ACTIONS = new Set<WatchlistOperationAction>([
  'retry_failed_delivery', 'retry_dead_letter', 'release_stale_processing', 'retry_failed_research',
]);

export function parseWatchlistOperationCommand(value: unknown): WatchlistOperationCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.action !== 'string' || !ACTIONS.has(input.action as WatchlistOperationAction)) return null;
  const limit = input.limit === undefined ? 100 : Number(input.limit);
  const olderThanMinutes = input.olderThanMinutes === undefined ? 30 : Number(input.olderThanMinutes);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return null;
  if (!Number.isInteger(olderThanMinutes) || olderThanMinutes < 15 || olderThanMinutes > 1440) return null;
  if (input.tickers !== undefined && (!Array.isArray(input.tickers)
    || input.tickers.length > 50
    || input.tickers.some((ticker) => typeof ticker !== 'string' || !ticker.trim() || ticker.length > 32))) return null;
  const tickers = [...new Set((input.tickers as string[] | undefined ?? []).map((ticker) => ticker.trim().toUpperCase()))];
  if (tickers.length > 0 && input.action !== 'retry_failed_research') return null;
  return { action: input.action as WatchlistOperationAction, limit, olderThanMinutes, tickers };
}

export function aggregateWatchlistOperations(input: WatchlistOperationsInput) {
  const latest = input.alertRuns[0] ?? null;
  const latestAt = latest ? new Date(latest.finished_at ?? latest.started_at).getTime() : Number.NaN;
  const ageMinutes = Number.isFinite(latestAt)
    ? Math.max(0, Math.round((new Date(input.now).getTime() - latestAt) / 60_000))
    : null;
  const alertBacklog = input.eventCounts.pending + input.eventCounts.processing + input.eventCounts.failed;
  const healthy = !!latest
    && latest.status === 'succeeded'
    && ageMinutes !== null
    && ageMinutes <= 30
    && input.eventCounts.dead_letter === 0
    && alertBacklog < 500;
  return {
    generatedAt: input.now,
    status: healthy ? 'healthy' as const : latest ? 'degraded' as const : 'unknown' as const,
    alerts: {
      latestRun: latest,
      latestRunAgeMinutes: ageMinutes,
      backlog: alertBacklog,
      eventCounts: input.eventCounts,
      recentRuns: input.alertRuns,
    },
    research: { due: input.researchDue, failed: input.researchFailed },
  };
}
