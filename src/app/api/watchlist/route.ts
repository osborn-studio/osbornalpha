import { serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { validateSelectableSecuritiesWithClient } from '@/lib/watchlist/security-validation';
import { upsertWatchlistItem } from '@/lib/watchlist/server-repository';
import { isWatchlistPlanLimitError } from '@/lib/watchlist/plan-limits';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

// GET /api/watchlist — list all watchlists with items for current user
export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_list', request);
  if (!serverIsSupabaseConfigured()) {
    return reporter.json({ error: 'Supabase not configured (guest mode uses localStorage)' });
  }
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const { data, error } = await reporter.step('load_watchlists', async () => await auth.client
      .from('watchlists')
      .select('id, name, description, weight, sort_order, watchlist_items (id, ticker, conviction, sort_order)')
      .order('sort_order'));
    if (error) throw new Error(error.message);
    const watchlists = data || [];
    return reporter.json({ watchlists }, { fields: { watchlist_count: watchlists.length } });
  } catch (error) {
    return reporter.fail(error, 'watchlist_load_failed');
  }
}

// POST /api/watchlist — add ticker to a watchlist
export async function POST(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_item_create', request);
  if (!serverIsSupabaseConfigured()) {
    return reporter.reject('supabase_unavailable', 503);
  }
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { client: sb, user } = auth;

  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, sb, 'write');
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => ({}));
  const { watchlist_id, ticker, conviction = 5, sort_order = 0 } = body;
  if (!watchlist_id || typeof ticker !== 'string') return reporter.reject('missing_fields', 400);

  const validation = await reporter.step('validate_security', () => validateSelectableSecuritiesWithClient(sb, [ticker]));
  if (!validation.valid) {
    return reporter.reject('security_not_selectable', 422, { details: { tickers: validation.rejected } });
  }
  const canonicalTicker = validation.canonicalTickers[0];

  const { data, error } = await reporter.step('store_item', () => upsertWatchlistItem(sb, {
    watchlist_id,
    ticker: canonicalTicker,
    conviction,
    sort_order,
    user_id: user.id,
  }));
  if (isWatchlistPlanLimitError(error, 'item')) return reporter.reject('watchlist_item_plan_limit', 403);
  if (error) return reporter.fail(error, 'watchlist_item_create_failed');
  return reporter.json({ item: data }, { fields: { item_count: data ? 1 : 0 } });
}
