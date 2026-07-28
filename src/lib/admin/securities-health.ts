import type { SecurityUniverse } from '@/lib/securities/model';

const SCOPES: SecurityUniverse[] = [
  'a_stock', 'a_exchange_fund', 'a_cb', 'hk_main', 'sp500', 'nasdaq_top500', 'us_china',
];
const CANARY_TICKERS = ['002463.SZ', '113001.SH', '00700.HK', 'AAPL', 'BABA'];

export interface HealthMembershipInput {
  ticker: string;
  universe: string;
  is_active: boolean;
  as_of_date: string;
}

export interface HealthRunInput {
  scope: string;
  status: string;
  completed_at: string | null;
  source_as_of: string | null;
  inserted_count: number;
  updated_count: number;
  deactivated_count: number;
  error_code: string | null;
}

export interface HealthEventInput {
  event_name: string;
  metadata: Record<string, unknown> | null;
}

export interface HealthCanaryInput {
  ticker: string;
  is_active: boolean;
  list_status: string;
}

export interface SecuritiesHealthResponse {
  generated_at: string;
  candidate_backlog: number;
  scopes: Array<{
    scope: SecurityUniverse;
    status: 'healthy' | 'warning' | 'error' | 'unknown';
    active_count: number;
    data_age_hours: number | null;
    last_result: string | null;
    last_success_at: string | null;
    last_rejected_at: string | null;
    changed_count: number;
    deactivated_count: number;
    error_code: string | null;
  }>;
  search: {
    hit_rate: number;
    zero_result_rate: number;
    resolver_completion_rate: number;
    legacy_force_add_ratio: number;
  };
  canaries: Array<{ ticker: string; healthy: boolean }>;
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function byCompletedDesc(a: HealthRunInput, b: HealthRunInput): number {
  return Date.parse(b.completed_at ?? '1970-01-01') - Date.parse(a.completed_at ?? '1970-01-01');
}

export function aggregateSecuritiesHealth(input: {
  now: string;
  memberships: HealthMembershipInput[];
  runs: HealthRunInput[];
  pendingCandidates: number;
  events: HealthEventInput[];
  canaries: HealthCanaryInput[];
}): SecuritiesHealthResponse {
  const nowMs = Date.parse(input.now);
  const scopes = SCOPES.map((scope) => {
    const runs = input.runs.filter((run) => run.scope === scope).sort(byCompletedDesc);
    const latest = runs[0] ?? null;
    const success = runs.find((run) => run.status === 'success') ?? null;
    const rejected = runs.find((run) => run.status === 'rejected') ?? null;
    const age = success?.completed_at
      ? Math.max(0, Number(((nowMs - Date.parse(success.completed_at)) / 3_600_000).toFixed(1)))
      : null;
    const status = !latest ? 'unknown'
      : latest.status === 'failed' || latest.status === 'rejected' ? 'error'
        : age !== null && age > 48 ? 'warning' : 'healthy';
    return {
      scope,
      status,
      active_count: input.memberships.filter((row) => row.universe === scope && row.is_active).length,
      data_age_hours: age,
      last_result: latest?.status ?? null,
      last_success_at: success?.completed_at ?? null,
      last_rejected_at: rejected?.completed_at ?? null,
      changed_count: success ? success.inserted_count + success.updated_count : 0,
      deactivated_count: success?.deactivated_count ?? 0,
      error_code: latest?.error_code ?? null,
    } as SecuritiesHealthResponse['scopes'][number];
  });

  const searches = input.events.filter((event) => event.event_name === 'stock_search_completed');
  const hits = searches.filter((event) => Number(event.metadata?.results ?? 0) > 0).length;
  const zeroes = searches.length - hits;
  const resolverStarted = input.events.filter((event) => event.event_name === 'security_resolve_started').length;
  const resolverCompleted = input.events.filter((event) => event.event_name === 'security_resolve_completed').length;
  const forced = input.events.filter((event) => event.event_name === 'stock_force_added').length;
  const adds = input.events.filter((event) => event.event_name === 'watchlist_stock_added').length;
  const canaryMap = new Map(input.canaries.map((row) => [row.ticker, row]));

  return {
    generated_at: input.now,
    candidate_backlog: input.pendingCandidates,
    scopes,
    search: {
      hit_rate: ratio(hits, searches.length),
      zero_result_rate: ratio(zeroes, searches.length),
      resolver_completion_rate: ratio(resolverCompleted, resolverStarted),
      legacy_force_add_ratio: ratio(forced, forced + adds),
    },
    canaries: CANARY_TICKERS.map((ticker) => {
      const row = canaryMap.get(ticker);
      return { ticker, healthy: Boolean(row?.is_active && row.list_status === 'listed') };
    }),
  };
}
