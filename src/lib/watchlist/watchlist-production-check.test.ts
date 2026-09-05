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
        'watchlist_ui_preferences',
        'watchlist_metric_snapshots',
        'watchlist_metric_extensions',
        'watchlist_overview_query',
        'watchlist_alert_scopes',
        'market_calendar_overrides',
        'shared_quote_snapshots',
        'shared_research_artifacts',
        'watchlist_operational_health',
        'watchlist_activity_feedback_hardening',
        'watchlist_operational_monitoring',
        'watchlist_atomic_research_quota',
        'perspective_analysis_modes',
        'watchlist_review_workflow',
        'watchlist_review_reminders',
        'watchlist_metric_alerts',
        'perspective_generation_jobs',
        'perspective_claims',
      ].find((candidate) => url.includes(candidate));
      const body = url.includes('/rpc/get_watchlist_operational_health')
        ? JSON.stringify({
            generated_at: '2026-09-04T12:00:00Z',
            research_queue: { due: 0, failed: 0, oldest_due_at: null },
            metric_queue: { due: 0, failed: 0, oldest_due_at: null },
            perspective_generation_queue: {
              queued: 0, running: 0, failed: 0, oldest_queued_at: null, oldest_running_at: null,
            },
            quotes: { count: 0, latest_observed_at: null },
            metrics: { count: 0, latest_observed_at: null },
            alerts: { latest_finished_at: null, latest_status: null, pending: 0, failed: 0, dead_letter: 0, oldest_pending_at: null },
            citations: { sample_size: 0, average_coverage: null },
            shared_research: { artifacts: 0, links: 0 },
            perspective_evaluations: { pending: 0, dead_letter: 0, oldest_due_at: null },
          })
        : url.includes('watchlist_release_markers') ? JSON.stringify(marker ? [{ marker }] : []) : '[]';
      return new Response(body, { status: 200 });
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
        'watchlist_ui_preference_columns',
        'watchlist_ui_preferences_release_marker',
        'watchlist_metric_snapshot_columns',
        'watchlist_metric_refresh_columns',
        'watchlist_metric_claim_rpc',
        'watchlist_metric_snapshots_release_marker',
        'watchlist_metric_extensions_release_marker',
        'watchlist_overview_query_rpc',
        'watchlist_overview_query_release_marker',
        'watchlist_alert_scope_columns',
        'watchlist_alert_scopes_release_marker',
        'market_calendar_override_columns',
        'market_calendar_overrides_release_marker',
        'shared_quote_snapshot_columns',
        'shared_quote_snapshots_release_marker',
        'shared_research_artifact_columns',
        'user_research_artifact_link_columns',
        'shared_research_load_rpc',
        'shared_research_artifacts_release_marker',
        'watchlist_activity_state_columns',
        'perspective_feedback_columns',
        'perspective_outcome_columns',
        'perspective_evaluation_queue_columns',
        'perspective_evaluation_claim_rpc',
        'watchlist_activity_feedback_hardening_release_marker',
        'watchlist_atomic_research_quota_release_marker',
        'perspective_analysis_mode_columns',
        'perspective_analysis_modes_release_marker',
        'watchlist_review_workflow_release_marker',
        'watchlist_review_reminder_rpc',
        'watchlist_review_reminders_release_marker',
        'watchlist_metric_alerts_release_marker',
        'perspective_generation_job_columns',
        'perspective_generation_claim_rpc',
        'perspective_generation_jobs_release_marker',
        'perspective_claim_columns',
        'perspective_claims_release_marker',
        'watchlist_operational_health_rpc',
        'watchlist_operational_health_release_marker',
        'watchlist_operational_monitoring_release_marker',
      ]));
      expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/rpc/get_watchlist_overview_cursor'), expect.objectContaining({ method: 'POST' }));
      expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('audit_version,query_plan,result_citation_ids,result_set_hash'), expect.anything());
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining('/rpc/claim_watchlist_metric_refresh'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_limit: 0, p_lease_minutes: 1 }) }),
      );
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining('/rpc/load_watchlist_research_artifacts'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining('/rpc/get_watchlist_overview_query'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            p_limit: 1,
            p_sort: 'position',
            p_direction: 'asc',
            p_quote_status: null,
            p_history_range: '1y',
            p_metric: null,
            p_metric_min: null,
            p_metric_max: null,
            p_fingerprint: 'production-check',
          }),
        }),
      );
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining('/rpc/claim_perspective_evaluations'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_limit: 0 }) }),
      );
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining('/rpc/enqueue_watchlist_review_reminders'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_limit: 0 }) }),
      );
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining('/rpc/claim_perspective_generation_jobs'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ p_limit: 0, p_lease_minutes: 1, p_job_id: null }),
        }),
      );
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
