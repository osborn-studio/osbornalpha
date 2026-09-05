import {
  providerCanariesPassed,
  runWatchlistProviderCanaries,
} from '../src/lib/watchlist/provider-canary';

async function main(): Promise<void> {
  const results = await runWatchlistProviderCanaries();
  const ok = providerCanariesPassed(results);
  console.log(JSON.stringify({ ok, providers: results }, null, 2));
  if (!ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'watchlist_provider_check_failed');
  process.exitCode = 1;
});
