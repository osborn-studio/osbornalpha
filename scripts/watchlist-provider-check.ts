import {
  providerCanariesPassed,
  runWatchlistProviderCanaries,
} from '../src/lib/watchlist/provider-canary';
import { getAdminSupabase } from '../src/lib/supabase/admin';
import { recordWatchlistProviderHealth } from '../src/lib/watchlist/provider-health-repository';

async function main(): Promise<void> {
  const results = await runWatchlistProviderCanaries();
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await recordWatchlistProviderHealth(getAdminSupabase(), results);
  }
  const ok = providerCanariesPassed(results);
  console.log(JSON.stringify({ ok, providers: results }, null, 2));
  if (!ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'watchlist_provider_check_failed');
  process.exitCode = 1;
});
