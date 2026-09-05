import {
  authorizeWatchlistResearchRefresh,
  type WatchlistQuotaClient,
  type WatchlistQuotaResult,
} from './plan-limits';

export type ResearchRefreshAuthorization =
  | { allowed: true; plan: WatchlistQuotaResult }
  | { allowed: false; reason: 'plan_limit'; plan: WatchlistQuotaResult }
  | { allowed: false; reason: 'rate_limit'; plan: WatchlistQuotaResult };

interface Dependencies {
  authorize: typeof authorizeWatchlistResearchRefresh;
}

const productionDependencies: Dependencies = {
  authorize: authorizeWatchlistResearchRefresh,
};

export async function authorizeResearchRefresh(
  client: WatchlistQuotaClient,
  dependencies: Dependencies = productionDependencies,
): Promise<ResearchRefreshAuthorization> {
  const result = await dependencies.authorize(client);
  const plan: WatchlistQuotaResult = {
    allowed: result.allowed,
    used: result.used,
    limit: result.limit,
    plan: result.plan,
  };
  return result.allowed
    ? { allowed: true, plan }
    : { allowed: false, reason: result.reason!, plan };
}
