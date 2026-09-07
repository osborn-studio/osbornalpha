import { describe, expect, it, vi } from 'vitest';
import { runWatchlistProductionChecks } from '../../../scripts/watchlist-production-check';

function validCronDispatchAclHealth() {
  return {
    claim: { anon: false, authenticated: false, service_role: true },
    finish: { anon: false, authenticated: false, service_role: true },
    cleanup: { anon: false, authenticated: false, service_role: true },
    health: { anon: false, authenticated: false, service_role: true },
  };
}

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
        'watchlist_peer_metrics',
        'watchlist_composition_metrics',
        'watchlist_composition_snapshots',
        'watchlist_peer_metric_alerts',
        'watchlist_alert_summaries',
        'watchlist_overview_query',
        'watchlist_overview_peer_query',
        'watchlist_alert_scopes',
        'market_calendar_overrides',
        'shared_quote_snapshots',
        'shared_research_artifacts',
        'watchlist_operational_health',
        'watchlist_activity_feedback_hardening',
        'watchlist_operational_monitoring',
        'watchlist_atomic_research_quota',
        'watchlist_research_jobs',
        'watchlist_bulk_workflow_runs',
        'watchlist_cron_dispatch_slots',
        'watchlist_api_rate_limits',
        'watchlist_cron_dispatch_acl_hardening',
        'watchlist_cron_dispatch_acl_health',
        'perspective_analysis_modes',
        'watchlist_review_workflow',
        'watchlist_review_reminders',
        'watchlist_metric_alerts',
        'perspective_generation_jobs',
        'perspective_claims',
        'perspective_claim_feedback',
        'watchlist_perspective_alert_reviews',
        'watchlist_claim_alert_hardening',
        'watchlist_decision_context',
        'watchlist_operational_retention',
        'watchlist_manual_research_job_health',
        'watchlist_provider_health',
      ].find((candidate) => url.includes(candidate));
      const body = url.includes('/rpc/get_watchlist_cron_dispatch_health')
        ? JSON.stringify({
            pending: 0, running: 1, failed: 0, dead_letter: 0,
            oldest_unsucceeded_at: '2026-09-04T12:00:00Z',
            latest_succeeded_at: '2026-09-04T11:45:00Z',
          })
        : url.includes('/rpc/get_watchlist_operational_health')
        ? JSON.stringify({
            generated_at: '2026-09-04T12:00:00Z',
            research_queue: { due: 0, failed: 0, oldest_due_at: null },
            manual_research_jobs: {
              queued: 0, running: 0, failed: 0, cancelled: 0,
              oldest_queued_at: null, oldest_running_at: null,
            },
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
        : url.includes('/rpc/get_watchlist_cron_dispatch_acl_health')
        ? JSON.stringify(validCronDispatchAclHealth())
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
        'watchlist_peer_metrics_release_marker',
        'watchlist_composition_metrics_release_marker',
        'watchlist_peer_metric_alerts_release_marker',
        'watchlist_alert_summaries_release_marker',
        'watchlist_overview_query_rpc',
        'watchlist_overview_query_release_marker',
        'watchlist_overview_peer_query_release_marker',
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
        'watchlist_bulk_workflow_run_columns',
        'watchlist_bulk_workflow_cleanup_rpc',
        'watchlist_bulk_workflow_runs_release_marker',
        'watchlist_cron_dispatch_slot_columns',
        'watchlist_cron_dispatch_health_rpc',
        'watchlist_cron_dispatch_acl_health_rpc',
        'watchlist_cron_dispatch_slots_release_marker',
        'watchlist_api_rate_limit_columns',
        'watchlist_api_rate_limit_cleanup_rpc',
        'watchlist_cron_dispatch_acl_health_release_marker',
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
        'perspective_claim_feedback_columns',
        'perspective_claim_feedback_release_marker',
        'watchlist_alert_origin_columns',
        'watchlist_review_reason_columns',
        'watchlist_perspective_alert_reviews_release_marker',
        'watchlist_claim_alert_hardening_release_marker',
        'watchlist_decision_context_column',
        'watchlist_decision_context_release_marker',
        'watchlist_operational_retention_rpc',
        'watchlist_operational_retention_release_marker',
        'watchlist_manual_research_job_health_release_marker',
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

  it.each([
    ['malformed JSON', '{'],
    ['a null top-level response', 'null'],
    ['an array top-level response', '[]'],
    ['a scalar top-level response', '1'],
    ['a missing action', JSON.stringify((() => {
      const { health: _health, ...value } = validCronDispatchAclHealth();
      return value;
    })())],
    ['a missing role', JSON.stringify({
      ...validCronDispatchAclHealth(),
      claim: { anon: false, authenticated: false },
    })],
    ['an unknown action', JSON.stringify({
      ...validCronDispatchAclHealth(),
      archive: { anon: false, authenticated: false, service_role: true },
    })],
    ['an unknown role', JSON.stringify({
      ...validCronDispatchAclHealth(),
      claim: { anon: false, authenticated: false, service_role: true, admin: true },
    })],
    ['a non-boolean role value', JSON.stringify({
      ...validCronDispatchAclHealth(),
      claim: { anon: null, authenticated: false, service_role: true },
    })],
    ['anonymous execution', JSON.stringify({
      ...validCronDispatchAclHealth(),
      claim: { anon: true, authenticated: false, service_role: true },
    })],
    ['authenticated execution', JSON.stringify({
      ...validCronDispatchAclHealth(),
      finish: { anon: false, authenticated: true, service_role: true },
    })],
    ['a missing service role grant', JSON.stringify({
      ...validCronDispatchAclHealth(),
      cleanup: { anon: false, authenticated: false, service_role: false },
    })],
  ])('fails closed when the scheduler ACL health endpoint returns %s', async (_label, body) => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
    try {
      const results = await runWatchlistProductionChecks(async (input) => {
        if (String(input).includes('/rpc/get_watchlist_cron_dispatch_acl_health')) {
          return new Response(body, { status: 200 });
        }
        return new Response('[]', { status: 200 });
      });
      expect(results.find((result) => result.name === 'watchlist_cron_dispatch_acl_health_rpc')).toMatchObject({
        ok: false, status: 200, detail: 'watchlist_cron_dispatch_acl_invalid',
      });
    } finally {
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});
