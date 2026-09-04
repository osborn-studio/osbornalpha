import { describe, expect, it, vi } from 'vitest';
import { runWatchlistProductionChecks } from '../../../scripts/watchlist-production-check';

describe('watchlist production schema verifier', () => {
  it('checks every additive Watchlist structure without exposing credentials', async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('https://project.supabase.co');
      expect(init?.headers).toMatchObject({ apikey: 'secret', authorization: 'Bearer secret' });
      const url = String(input);
      const marker = [
        'external_evidence_audit_snapshot',
        'watchlist_research_event_clusters',
        'watchlist_monitoring_status',
      ].find((candidate) => url.includes(candidate));
      return new Response(url.includes('watchlist_release_markers')
        ? JSON.stringify(marker ? [{ marker }] : [])
        : '[]', { status: 200 });
    });
    try {
      const results = await runWatchlistProductionChecks(fetcher);
      expect(results.every((result) => result.ok)).toBe(true);
      expect(results.map((result) => result.name)).toEqual(expect.arrayContaining([
        'overview_cursor_rpc',
        'news_event_cluster_columns',
        'report_event_cluster_columns',
        'external_evidence_event_cluster_columns',
        'research_event_clusters_release_marker',
      ]));
      expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/rpc/get_watchlist_overview_cursor'), expect.objectContaining({ method: 'POST' }));
      expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('audit_version,query_plan,result_citation_ids,result_set_hash'), expect.anything());
    } finally {
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  it('returns a failed check instead of throwing on an unavailable endpoint', async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    try {
      const results = await runWatchlistProductionChecks(async () => new Response('column missing', { status: 400 }));
      expect(results.every((result) => !result.ok)).toBe(true);
      expect(results[0].detail).toBe('column missing');
    } finally {
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  it('fails when the release marker is missing even if the endpoint responds', async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    try {
      const results = await runWatchlistProductionChecks(async () => new Response('[]', { status: 200 }));
      expect(results.find((result) => result.name === 'monitoring_status_release_marker')).toMatchObject({
        ok: false, status: 200, detail: 'release_marker_missing',
      });
    } finally {
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});
