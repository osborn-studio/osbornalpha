import { describe, expect, it, vi } from 'vitest';
import { assertLatestWatchlistReleaseMarker, LATEST_WATCHLIST_RELEASE_MARKER } from './release';

const environment = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'secret',
};

describe('Watchlist release marker gate', () => {
  it('accepts only the latest applied marker without logging credentials', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(new Response(JSON.stringify([
      { marker: LATEST_WATCHLIST_RELEASE_MARKER },
    ]), { status: 200 }));
    await expect(assertLatestWatchlistReleaseMarker(environment, fetcher)).resolves.toBeUndefined();
    expect(String(fetcher.mock.calls[0][0])).toContain(`marker=eq.${LATEST_WATCHLIST_RELEASE_MARKER}`);
    expect(String(fetcher.mock.calls[0][0])).not.toContain('secret');
  });

  it('fails closed for missing credentials, endpoints, or markers', async () => {
    await expect(assertLatestWatchlistReleaseMarker({}, fetch)).rejects.toThrow(
      'watchlist_schema_gate_credentials_missing',
    );
    await expect(assertLatestWatchlistReleaseMarker(environment, async () => (
      new Response('[]', { status: 200 })
    ))).rejects.toThrow('watchlist_schema_marker_missing');
  });
});
