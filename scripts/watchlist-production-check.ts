interface SchemaCheck {
  name: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  validate?: (body: string) => string | undefined;
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
  {
    name: 'external_evidence_audit_columns',
    path: '/rest/v1/external_evidence_runs?select=audit_version,query_plan,result_citation_ids,result_set_hash&limit=1',
  },
  { name: 'ticker_refresh_queue', path: '/rest/v1/watchlist_research_ticker_refresh_state?select=ticker,status&limit=1' },
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
