export interface WatchlistQuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  plan: string;
}

export type WatchlistQuotaClient = object;

export type WatchlistResearchAuthorizationResult = WatchlistQuotaResult & {
  reason: 'plan_limit' | 'rate_limit' | null;
};

function parseQuotaResult(data: unknown): WatchlistQuotaResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('watchlist_research_quota_invalid');
  const value = data as Record<string, unknown>;
  if (typeof value.allowed !== 'boolean' || !Number.isInteger(value.used)
    || !Number.isInteger(value.limit) || typeof value.plan !== 'string') {
    throw new Error('watchlist_research_quota_invalid');
  }
  return value as unknown as WatchlistQuotaResult;
}

export async function consumeWatchlistResearchQuota(client: WatchlistQuotaClient): Promise<WatchlistQuotaResult> {
  const repository = client as {
    rpc(name: 'consume_watchlist_research_quota'): Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('consume_watchlist_research_quota');
  if (error) throw new Error(`watchlist_research_quota_failed:${error.message}`);
  return parseQuotaResult(data);
}

export async function authorizeWatchlistResearchRefresh(
  client: WatchlistQuotaClient,
): Promise<WatchlistResearchAuthorizationResult> {
  const repository = client as {
    rpc(name: 'authorize_watchlist_research_refresh'): Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('authorize_watchlist_research_refresh');
  if (error) throw new Error(`watchlist_research_quota_failed:${error.message}`);
  const quota = parseQuotaResult(data);
  const reason = (data as Record<string, unknown>).reason;
  if (reason !== null && reason !== 'plan_limit' && reason !== 'rate_limit') {
    throw new Error('watchlist_research_quota_invalid');
  }
  if (quota.allowed !== (reason === null)) throw new Error('watchlist_research_quota_invalid');
  return { ...quota, reason };
}

export async function refundWatchlistResearchQuota(client: WatchlistQuotaClient): Promise<void> {
  const repository = client as {
    rpc(name: 'refund_watchlist_research_quota'): Promise<{ error: { message: string } | null }>;
  };
  const { error } = await repository.rpc('refund_watchlist_research_quota');
  if (error) throw new Error(`watchlist_research_quota_refund_failed:${error.message}`);
}

export function isWatchlistPlanLimitError(error: { message?: string } | null | undefined, resource: 'item' | 'alert'): boolean {
  return Boolean(error?.message?.includes(`watchlist_${resource}_plan_limit`));
}
