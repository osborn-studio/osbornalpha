import {
  evaluateWatchlistOperationalHealth,
  parseWatchlistOperationalHealth,
} from '../src/lib/watchlist/operational-health';
import { LATEST_WATCHLIST_RELEASE_MARKER } from '../src/lib/watchlist/release';

interface SchemaCheck {
  name: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  validate?: (body: string) => string | undefined;
}

function releaseMarkerCheck(marker: string): SchemaCheck {
  return {
    name: `${marker}_release_marker`,
    path: `/rest/v1/watchlist_release_markers?select=marker&marker=eq.${marker}&limit=1`,
    validate: (body) => {
      try {
        const rows = JSON.parse(body);
        return Array.isArray(rows) && rows.some((row) => row?.marker === marker)
          ? undefined
          : 'release_marker_missing';
      } catch {
        return 'release_marker_response_invalid';
      }
    },
  };
}

function validateWatchlistCronDispatchAcl(body: string): string | undefined {
  try {
    const value = JSON.parse(body) as unknown;
    const actions = ['claim', 'finish', 'cleanup', 'health'] as const;
    const expectedRoles = ['anon', 'authenticated', 'service_role'] as const;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== actions.length
      || !actions.every((action) => Object.hasOwn(value, action))) {
      return 'watchlist_cron_dispatch_acl_invalid';
    }
    const matrix = value as Record<string, unknown>;
    for (const action of actions) {
      const actionRoles = matrix[action];
      if (!actionRoles || typeof actionRoles !== 'object' || Array.isArray(actionRoles)
        || Object.keys(actionRoles).length !== expectedRoles.length
        || !expectedRoles.every((role) => Object.hasOwn(actionRoles, role))
      ) {
        return 'watchlist_cron_dispatch_acl_invalid';
      }
      const roleMatrix = actionRoles as Record<string, unknown>;
      if (roleMatrix.anon !== false || roleMatrix.authenticated !== false || roleMatrix.service_role !== true) {
        return 'watchlist_cron_dispatch_acl_invalid';
      }
    }
    return undefined;
  } catch {
    return 'watchlist_cron_dispatch_acl_invalid';
  }
}

export interface WatchlistProductionCheckResult {
  name: string;
  ok: boolean;
  status: number | null;
  detail?: string;
}

const CHECKS: SchemaCheck[] = [
  {
    name: 'overview_cursor_rpc',
    path: '/rest/v1/rpc/get_watchlist_overview_cursor',
    method: 'POST',
    body: {
      p_group_sort: null,
      p_item_sort: null,
      p_item_id: null,
      p_limit: 1,
      p_ticker: null,
    },
  },
  { name: 'news_quality_columns', path: '/rest/v1/news_items?select=quality_score,quality_flags&limit=1' },
  { name: 'report_quality_columns', path: '/rest/v1/broker_reports?select=quality_score,quality_flags&limit=1' },
  { name: 'external_evidence_quality_columns', path: '/rest/v1/external_evidence?select=quality_score,quality_flags&limit=1' },
  { name: 'news_event_cluster_columns', path: '/rest/v1/news_items?select=event_cluster_id,corroboration_count,corroborating_sources&limit=1' },
  { name: 'report_event_cluster_columns', path: '/rest/v1/broker_reports?select=event_cluster_id,corroboration_count,corroborating_sources&limit=1' },
  { name: 'external_evidence_event_cluster_columns', path: '/rest/v1/external_evidence?select=event_cluster_id,corroboration_count,corroborating_sources&limit=1' },
  {
    name: 'external_evidence_audit_columns',
    path: '/rest/v1/external_evidence_runs?select=audit_version,query_plan,result_citation_ids,result_set_hash&limit=1',
  },
  { name: 'ticker_refresh_queue', path: '/rest/v1/watchlist_research_ticker_refresh_state?select=ticker,status&limit=1' },
  {
    name: 'watchlist_ui_preference_columns',
    path: '/rest/v1/user_preferences?select=watchlist_ui_preferences,watchlist_ui_preferences_version,watchlist_ui_preferences_updated_at&limit=1',
  },
  {
    name: 'watchlist_metric_snapshot_columns',
    path: '/rest/v1/watchlist_metric_snapshots?select=ticker,market,history_range,benchmark_ticker,metrics,source_bundle,calculator_version,observed_at,generated_at,valid_until,period_return_pct,total_return_pct,annualized_volatility_pct,max_drawdown_pct,rsi14,excess_return_pct,beta,volume_zscore_20,average_traded_amount_20,coverage_ratio&limit=1',
  },
  {
    name: 'watchlist_metric_refresh_columns',
    path: '/rest/v1/watchlist_metric_refresh_state?select=ticker,market,history_range,benchmark_ticker,status,next_refresh_at,lease_expires_at&limit=1',
  },
  {
    name: 'watchlist_metric_claim_rpc',
    path: '/rest/v1/rpc/claim_watchlist_metric_refresh',
    method: 'POST',
    body: { p_limit: 0, p_lease_minutes: 1 },
  },
  releaseMarkerCheck('watchlist_metric_snapshots'),
  releaseMarkerCheck('watchlist_metric_extensions'),
  releaseMarkerCheck('watchlist_peer_metrics'),
  releaseMarkerCheck('watchlist_composition_metrics'),
  {
    name: 'watchlist_composition_snapshot_columns',
    path: '/rest/v1/watchlist_composition_snapshots?select=user_id,history_range,watchlist_version,composition,observed_at,generated_at,valid_until&limit=1',
  },
  {
    name: 'watchlist_composition_refresh_rpc',
    path: '/rest/v1/rpc/refresh_watchlist_composition_snapshots',
    method: 'POST',
    body: { p_limit: 0 },
  },
  releaseMarkerCheck('watchlist_composition_snapshots'),
  releaseMarkerCheck('watchlist_peer_metric_alerts'),
  {
    name: 'watchlist_alert_summaries_rpc',
    path: '/rest/v1/rpc/get_watchlist_alert_summaries',
    method: 'POST',
    body: { p_item_ids: [] },
  },
  releaseMarkerCheck('watchlist_alert_summaries'),
  {
    name: 'watchlist_overview_query_rpc',
    path: '/rest/v1/rpc/get_watchlist_overview_query',
    method: 'POST',
    body: {
      p_limit: 1,
      p_sort: 'position',
      p_direction: 'asc',
      p_quote_status: null,
      p_history_range: '1y',
      p_metric: null,
      p_metric_min: null,
      p_metric_max: null,
      p_fingerprint: 'production-check',
    },
  },
  releaseMarkerCheck('watchlist_overview_query'),
  releaseMarkerCheck('watchlist_overview_peer_query'),
  {
    name: 'watchlist_alert_scope_columns',
    path: '/rest/v1/watchlist_alert_runs?select=scope,skipped_closed&limit=1',
  },
  releaseMarkerCheck('watchlist_alert_scopes'),
  {
    name: 'market_calendar_override_columns',
    path: '/rest/v1/market_calendar_overrides?select=market,date_key,kind,name,sessions,source,source_updated_at,fetched_at&limit=1',
  },
  releaseMarkerCheck('market_calendar_overrides'),
  {
    name: 'shared_quote_snapshot_columns',
    path: '/rest/v1/market_quote_snapshots?select=ticker,market,quote,source,observed_at,fetched_at,valid_until,stale_until&limit=1',
  },
  releaseMarkerCheck('shared_quote_snapshots'),
  {
    name: 'shared_research_artifact_columns',
    path: '/rest/v1/shared_research_artifacts?select=id,kind,ticker,source_key,title,source,url,published_at,fetched_at,event_cluster_id,quality_score,content_hash,payload,updated_at&limit=1',
  },
  {
    name: 'user_research_artifact_link_columns',
    path: '/rest/v1/user_research_artifact_links?select=user_id,artifact_id,linked_at&limit=1',
  },
  {
    name: 'shared_research_load_rpc',
    path: '/rest/v1/rpc/load_watchlist_research_artifacts',
    method: 'POST',
    body: { p_user_id: '00000000-0000-0000-0000-000000000000', p_ticker: 'AAPL', p_limit: 1 },
  },
  releaseMarkerCheck('shared_research_artifacts'),
  {
    name: 'watchlist_activity_state_columns',
    path: '/rest/v1/watchlist_activity_state?select=user_id,ticker,last_seen_at,updated_at&limit=1',
  },
  {
    name: 'perspective_feedback_columns',
    path: '/rest/v1/perspective_feedback?select=id,user_id,perspective_id,verdict,reason,corrected_stance,created_at,updated_at&limit=1',
  },
  {
    name: 'perspective_outcome_columns',
    path: '/rest/v1/perspective_outcomes?select=id,perspective_id,horizon_days,reference_price,evaluated_price,return_pct,direction_correct,evaluated_at&limit=1',
  },
  {
    name: 'perspective_evaluation_queue_columns',
    path: '/rest/v1/perspective_evaluation_queue?select=perspective_id,horizon_days,due_at,next_attempt_at,attempt_count,claimed_at,status,dead_lettered_at,updated_at&limit=1',
  },
  {
    name: 'perspective_evaluation_claim_rpc',
    path: '/rest/v1/rpc/claim_perspective_evaluations',
    method: 'POST',
    body: { p_limit: 0 },
  },
  releaseMarkerCheck('watchlist_activity_feedback_hardening'),
  releaseMarkerCheck('watchlist_atomic_research_quota'),
  {
    name: 'watchlist_research_job_columns',
    path: '/rest/v1/watchlist_research_jobs?select=id,user_id,ticker,status,stage,progress,attempt_count,max_attempts,quota_plan,quota_limit,quota_used,next_attempt_at,lease_expires_at,lease_token,cancel_requested_at,result,error_code,created_at,started_at,finished_at,updated_at&limit=1',
  },
  {
    name: 'watchlist_research_job_claim_rpc',
    path: '/rest/v1/rpc/claim_watchlist_research_jobs',
    method: 'POST',
    body: { p_limit: 0, p_lease_minutes: 1, p_job_id: null },
  },
  releaseMarkerCheck('watchlist_research_jobs'),
  {
    name: 'watchlist_bulk_workflow_run_columns',
    path: '/rest/v1/watchlist_bulk_workflow_runs?select=id,user_id,request_id,request_hash,operation,status,result,lease_token,lease_expires_at,created_at,finished_at,updated_at&limit=1',
  },
  {
    name: 'watchlist_bulk_workflow_cleanup_rpc',
    path: '/rest/v1/rpc/cleanup_watchlist_bulk_workflow_runs',
    method: 'POST',
    body: { p_retention_days: 30, p_limit: 0 },
  },
  releaseMarkerCheck('watchlist_bulk_workflow_runs'),
  {
    name: 'watchlist_cron_dispatch_slot_columns',
    path: '/rest/v1/watchlist_cron_dispatch_slots?select=scheduled_for,status,attempt_count,max_attempts,lease_token,lease_expires_at,last_error_code,started_at,finished_at,created_at,updated_at&limit=1',
  },
  {
    name: 'watchlist_cron_dispatch_health_rpc',
    path: '/rest/v1/rpc/get_watchlist_cron_dispatch_health',
    method: 'POST',
    body: {},
  },
  {
    name: 'watchlist_cron_dispatch_acl_health_rpc',
    path: '/rest/v1/rpc/get_watchlist_cron_dispatch_acl_health',
    method: 'POST',
    body: {},
    validate: validateWatchlistCronDispatchAcl,
  },
  releaseMarkerCheck('watchlist_cron_dispatch_slots'),
  {
    name: 'watchlist_api_rate_limit_columns',
    path: '/rest/v1/watchlist_api_rate_limits?select=user_id,action,window_started_at,attempts,updated_at&limit=1',
  },
  {
    name: 'watchlist_api_rate_limit_cleanup_rpc',
    path: '/rest/v1/rpc/cleanup_watchlist_api_rate_limits',
    method: 'POST',
    body: { p_retention_days: 7, p_limit: 0 },
  },
  releaseMarkerCheck(LATEST_WATCHLIST_RELEASE_MARKER),
  {
    name: 'perspective_analysis_mode_columns',
    path: '/rest/v1/perspectives?select=requested_analysis_mode,resolved_analysis_mode,evidence_status&limit=1',
  },
  releaseMarkerCheck('perspective_analysis_modes'),
  releaseMarkerCheck('watchlist_review_workflow'),
  {
    name: 'watchlist_review_reminder_rpc',
    path: '/rest/v1/rpc/enqueue_watchlist_review_reminders',
    method: 'POST',
    body: { p_limit: 0 },
  },
  releaseMarkerCheck('watchlist_review_reminders'),
  releaseMarkerCheck('watchlist_metric_alerts'),
  {
    name: 'perspective_generation_job_columns',
    path: '/rest/v1/perspective_generation_jobs?select=id,user_id,ticker,status,stage,progress,attempt_count,max_attempts,quota_plan,quota_limit,quota_used,next_attempt_at,lease_expires_at,lease_token,cancel_requested_at,result_generation_id,error_code,created_at,started_at,finished_at,updated_at&limit=1',
  },
  {
    name: 'perspective_generation_claim_rpc',
    path: '/rest/v1/rpc/claim_perspective_generation_jobs',
    method: 'POST',
    body: { p_limit: 0, p_lease_minutes: 1, p_job_id: null },
  },
  releaseMarkerCheck('perspective_generation_jobs'),
  {
    name: 'perspective_claim_columns',
    path: '/rest/v1/perspectives?select=claims&limit=1',
  },
  releaseMarkerCheck('perspective_claims'),
  {
    name: 'perspective_claim_feedback_columns',
    path: '/rest/v1/perspective_claim_feedback?select=id,user_id,perspective_id,claim_id,verdict,reason,created_at,updated_at&limit=1',
  },
  releaseMarkerCheck('perspective_claim_feedback'),
  {
    name: 'watchlist_alert_origin_columns',
    path: '/rest/v1/watchlist_alert_origins?select=alert_id,user_id,perspective_id,claim_id,claim_text,invalidation_text,created_at&limit=1',
  },
  {
    name: 'watchlist_review_reason_columns',
    path: '/rest/v1/watchlist_review_reasons?select=id,user_id,watchlist_item_id,alert_event_id,reason_type,payload,snoozed_until,created_at,resolved_at&limit=1',
  },
  releaseMarkerCheck('watchlist_perspective_alert_reviews'),
  releaseMarkerCheck('watchlist_claim_alert_hardening'),
  {
    name: 'watchlist_decision_context_column',
    path: '/rest/v1/watchlist_item_decision_history?select=id,context_snapshot&limit=1',
  },
  releaseMarkerCheck('watchlist_decision_context'),
  {
    name: 'watchlist_operational_retention_rpc',
    path: '/rest/v1/rpc/cleanup_watchlist_operational_history',
    method: 'POST',
    body: { p_job_retention_days: 30, p_evidence_retention_days: 90, p_limit: 0 },
  },
  releaseMarkerCheck('watchlist_operational_retention'),
  releaseMarkerCheck('watchlist_manual_research_job_health'),
  {
    name: 'watchlist_operational_health_rpc',
    path: '/rest/v1/rpc/get_watchlist_operational_health',
    method: 'POST',
    body: {},
    validate: (body) => {
      try {
        const snapshot = parseWatchlistOperationalHealth(JSON.parse(body));
        if (!snapshot) return 'operational_health_response_invalid';
        const health = evaluateWatchlistOperationalHealth(snapshot);
        return health.status === 'critical' ? health.warnings.join(',') : undefined;
      } catch {
        return 'operational_health_response_invalid';
      }
    },
  },
  releaseMarkerCheck('watchlist_operational_health'),
  releaseMarkerCheck('watchlist_operational_monitoring'),
  {
    name: 'watchlist_provider_health_rpc',
    path: '/rest/v1/rpc/get_watchlist_provider_health',
    method: 'POST',
    body: {},
  },
  releaseMarkerCheck('watchlist_provider_health'),
  {
    name: 'monitoring_status_release_marker',
    path: '/rest/v1/watchlist_release_markers?select=marker&marker=eq.watchlist_monitoring_status&limit=1',
    validate: (body) => {
      try {
        const rows = JSON.parse(body);
        return Array.isArray(rows) && rows.some((row) => row?.marker === 'watchlist_monitoring_status')
          ? undefined
          : 'release_marker_missing';
      } catch {
        return 'release_marker_response_invalid';
      }
    },
  },
  {
    name: 'external_evidence_audit_release_marker',
    path: '/rest/v1/watchlist_release_markers?select=marker&marker=eq.external_evidence_audit_snapshot&limit=1',
    validate: (body) => {
      try {
        const rows = JSON.parse(body);
        return Array.isArray(rows) && rows.some((row) => row?.marker === 'external_evidence_audit_snapshot')
          ? undefined
          : 'release_marker_missing';
      } catch {
        return 'release_marker_response_invalid';
      }
    },
  },
  {
    name: 'research_event_clusters_release_marker',
    path: '/rest/v1/watchlist_release_markers?select=marker&marker=eq.watchlist_research_event_clusters&limit=1',
    validate: (body) => {
      try {
        const rows = JSON.parse(body);
        return Array.isArray(rows) && rows.some((row) => row?.marker === 'watchlist_research_event_clusters')
          ? undefined
          : 'release_marker_missing';
      } catch {
        return 'release_marker_response_invalid';
      }
    },
  },
  {
    name: 'watchlist_ui_preferences_release_marker',
    path: '/rest/v1/watchlist_release_markers?select=marker&marker=eq.watchlist_ui_preferences&limit=1',
    validate: (body) => {
      try {
        const rows = JSON.parse(body);
        return Array.isArray(rows) && rows.some((row) => row?.marker === 'watchlist_ui_preferences')
          ? undefined
          : 'release_marker_missing';
      } catch {
        return 'release_marker_response_invalid';
      }
    },
  },
];

function configuredEnvironment() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !serviceRoleKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return { baseUrl, serviceRoleKey };
}

function responseDetail(body: string): string | undefined {
  if (!body) return undefined;
  return body.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

export async function runWatchlistProductionChecks(
  fetcher: typeof fetch = fetch,
): Promise<WatchlistProductionCheckResult[]> {
  const { baseUrl, serviceRoleKey } = configuredEnvironment();
  const headers = {
    accept: 'application/json',
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  };
  const results: WatchlistProductionCheckResult[] = [];
  for (const check of CHECKS) {
    try {
      const response = await fetcher(`${baseUrl}${check.path}`, {
        method: check.method ?? 'GET',
        headers: check.body ? { ...headers, 'content-type': 'application/json' } : headers,
        ...(check.body ? { body: JSON.stringify(check.body) } : {}),
      });
      const body = await response.text();
      const validationError = response.ok && check.validate ? check.validate(body) : undefined;
      results.push({
        name: check.name,
        ok: response.ok && !validationError,
        status: response.status,
        ...(!response.ok || validationError ? { detail: validationError ?? responseDetail(body) } : {}),
      });
    } catch (error) {
      results.push({
        name: check.name,
        ok: false,
        status: null,
        detail: error instanceof Error ? error.message.slice(0, 240) : 'request_failed',
      });
    }
  }
  return results;
}

export async function main(): Promise<void> {
  try {
    const results = await runWatchlistProductionChecks();
    console.log(JSON.stringify({ ok: results.every((result) => result.ok), checks: results }, null, 2));
    if (results.some((result) => !result.ok)) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'watchlist_production_check_failed');
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('/scripts/watchlist-production-check.ts')) void main();
