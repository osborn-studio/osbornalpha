export const LATEST_WATCHLIST_RELEASE_MARKER = 'watchlist_cron_dispatch_acl_health';

interface ReleaseMarkerEnvironment {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export async function assertLatestWatchlistReleaseMarker(
  environment: ReleaseMarkerEnvironment = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const baseUrl = environment.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !key) throw new Error('watchlist_schema_gate_credentials_missing');
  const url = new URL(`${baseUrl}/rest/v1/watchlist_release_markers`);
  url.searchParams.set('select', 'marker');
  url.searchParams.set('marker', `eq.${LATEST_WATCHLIST_RELEASE_MARKER}`);
  url.searchParams.set('limit', '1');
  const response = await fetcher(url, {
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`watchlist_schema_gate_http_${response.status}`);
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body)
    || !body.some((row) => row?.marker === LATEST_WATCHLIST_RELEASE_MARKER)) {
    throw new Error(`watchlist_schema_marker_missing:${LATEST_WATCHLIST_RELEASE_MARKER}`);
  }
}
