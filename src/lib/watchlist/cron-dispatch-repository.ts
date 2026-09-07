export interface WatchlistCronDispatchSlot {
  scheduledFor: string;
  leaseToken: string;
  attemptCount: number;
}

interface WatchlistCronDispatchDatabase {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

function repositoryOf(db: object): WatchlistCronDispatchDatabase {
  return db as WatchlistCronDispatchDatabase;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseClaimedSlot(value: unknown): WatchlistCronDispatchSlot | null {
  const row = record(value);
  const scheduledFor = row?.scheduled_for;
  const leaseToken = row?.lease_token;
  const attemptCount = Number(row?.attempt_count);
  if (typeof scheduledFor !== 'string' || !Number.isFinite(Date.parse(scheduledFor))
    || typeof leaseToken !== 'string' || !/^[0-9a-f-]{36}$/i.test(leaseToken)
    || !Number.isSafeInteger(attemptCount) || attemptCount < 1) return null;
  return { scheduledFor, leaseToken, attemptCount };
}

export async function claimWatchlistCronDispatchSlots(
  db: object,
  now: Date,
  options: { lookbackMinutes: number; limit: number; leaseMinutes: number },
): Promise<WatchlistCronDispatchSlot[]> {
  const { data, error } = await repositoryOf(db).rpc('claim_watchlist_cron_dispatch_slots', {
    p_now: now.toISOString(),
    p_lookback_minutes: Math.min(Math.max(Math.floor(options.lookbackMinutes), 0), 24 * 60),
    p_limit: Math.min(Math.max(Math.floor(options.limit), 1), 96),
    p_lease_minutes: Math.min(Math.max(Math.floor(options.leaseMinutes), 1), 15),
  });
  if (error) throw new Error(`watchlist_cron_dispatch_claim_failed:${error.message}`);
  if (!Array.isArray(data)) throw new Error('watchlist_cron_dispatch_claim_invalid');
  const parsed = data.map(parseClaimedSlot);
  if (parsed.some((item) => item === null)) throw new Error('watchlist_cron_dispatch_claim_invalid');
  return parsed as WatchlistCronDispatchSlot[];
}

export async function finishWatchlistCronDispatchSlot(
  db: object,
  slot: WatchlistCronDispatchSlot,
  outcome: 'succeeded' | 'failed',
  errorCode: string | null,
): Promise<void> {
  const { data, error } = await repositoryOf(db).rpc('finish_watchlist_cron_dispatch_slot', {
    p_scheduled_for: slot.scheduledFor,
    p_lease_token: slot.leaseToken,
    p_succeeded: outcome === 'succeeded',
    p_error_code: errorCode?.slice(0, 100) ?? null,
  });
  if (error) throw new Error(`watchlist_cron_dispatch_finish_failed:${error.message}`);
  if (data !== true) throw new Error('watchlist_cron_dispatch_lease_lost');
}

export async function cleanupWatchlistCronDispatchSlots(
  db: object,
  retentionDays: number,
  limit: number,
): Promise<number> {
  const { data, error } = await repositoryOf(db).rpc('cleanup_watchlist_cron_dispatch_slots', {
    p_retention_days: Math.min(Math.max(Math.floor(retentionDays), 7), 365),
    p_limit: Math.min(Math.max(Math.floor(limit), 0), 5_000),
  });
  if (error) throw new Error(`watchlist_cron_dispatch_cleanup_failed:${error.message}`);
  const count = Number(data);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('watchlist_cron_dispatch_cleanup_invalid');
  return count;
}
