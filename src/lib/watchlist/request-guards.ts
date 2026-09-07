import { consumeWatchlistApiRateLimit, type WatchlistApiRateLimitAction } from './api-rate-limit';
import type { WatchlistRequestReporter } from './request-reporter';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

export type AuthorizedWatchlistRequest = {
  client: Awaited<ReturnType<typeof getServerSupabase>>;
  user: User;
};

export async function authorizeWatchlistRequest(
  reporter: WatchlistRequestReporter,
  request?: Pick<Request, 'headers'>,
): Promise<AuthorizedWatchlistRequest | Response> {
  if (!serverIsSupabaseConfigured()) return reporter.reject('supabase_unavailable', 503);
  try {
    const client = await getServerSupabase(request);
    const { data: { user } } = await reporter.step('authenticate', () => client.auth.getUser());
    return user ? { client, user } : reporter.reject('not_authenticated', 401);
  } catch (error) {
    return reporter.fail(error, 'watchlist_auth_unavailable');
  }
}

export async function enforceReportedWatchlistRateLimit(
  reporter: WatchlistRequestReporter,
  db: object,
  action: WatchlistApiRateLimitAction,
): Promise<Response | null> {
  try {
    const result = await reporter.step('rate_limit', () => consumeWatchlistApiRateLimit(db, action));
    if (result.allowed) return null;
    return reporter.reject('watchlist_rate_limited', 429, {
      retryAfterSeconds: result.retryAfterSeconds,
      details: { limit: result.limit, remaining: result.remaining },
    });
  } catch (error) {
    return reporter.fail(error, 'watchlist_rate_limit_unavailable', 503, { retryAfterSeconds: 5 });
  }
}
