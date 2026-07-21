export type UsageWindowKey = '24h' | '7d' | '30d';

export interface UsageEventInput {
  event_name: string;
  user_id: string | null;
  anonymous_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AiRunInput {
  status: 'running' | 'completed' | 'failed';
  user_id: string;
  ticker: string | null;
  duration_ms: number | null;
  method_id: string;
  error_code: string | null;
  created_at: string;
}

export interface ServiceAlertRunInput {
  check_name: 'ai_daily' | 'quote_15m' | 'auth_email_daily';
  status: 'healthy' | 'alerting' | 'error';
  window_start: string;
  window_end: string;
  violations: Array<{ code?: unknown }> | null;
  created_at: string;
}

export interface AuthEmailProbeInput {
  recipient_hash: string;
  domain: string;
  probe_date: string;
  signup_delivery: 'pending' | 'delayed' | 'delivered' | 'failed';
  recovery_delivery: 'pending' | 'delayed' | 'delivered' | 'failed';
}

interface SourceHealth {
  attempted: number;
  succeeded: number;
  failed: number;
  duration_ms: number;
}

export interface AdminUsageResponse {
  window: { key: UsageWindowKey; from: string; to: string };
  auth_funnel: {
    signup_email_sent: number;
    confirmation_resenders: number;
    confirmed_users: number;
    first_login_users: number;
    email_to_confirmation_rate: number;
    confirmation_to_first_login_rate: number;
  };
  funnel: {
    registrations: number;
    watchlist_viewers: number;
    activated_users: number;
    activation_rate: number;
  };
  search: { submitted: number; clicked: number; force_added: number; added: number };
  ai: {
    total: number;
    completed: number;
    failed: number;
    completion_rate: number;
    median_duration_ms: number | null;
    by_method: Record<string, number>;
    post_add_click_rate: number;
  };
  popular_tickers: Array<{ ticker: string; adds: number }>;
  quotes: {
    batches: number;
    failed_tickers: number;
    stale: number;
    sources: Record<string, SourceHealth>;
  };
  operational: {
    latest_checks: Array<{
      check_name: ServiceAlertRunInput['check_name'];
      status: ServiceAlertRunInput['status'];
      window_start: string;
      window_end: string;
      violation_codes: string[];
      created_at: string;
    }>;
    auth_email_probes: Array<{
      domain: string;
      probe_date: string;
      signup_delivery: AuthEmailProbeInput['signup_delivery'];
      recovery_delivery: AuthEmailProbeInput['recovery_delivery'];
    }>;
  };
  recent_ai_failures: Array<{
    ticker: string | null;
    method_id: string;
    error_code: string | null;
    created_at: string;
  }>;
}

interface AggregateUsageInput {
  confirmedUsers: Array<{ id: string }>;
  events: UsageEventInput[];
  aiRuns: AiRunInput[];
  serviceAlertRuns?: ServiceAlertRunInput[];
  authEmailProbes?: AuthEmailProbeInput[];
  window?: AdminUsageResponse['window'];
}

function identity(event: UsageEventInput): string | null {
  return event.user_id || event.anonymous_id || null;
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

function uniqueIdentities(events: UsageEventInput[], eventName: string): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.event_name !== eventName) continue;
    const id = identity(event);
    if (id) ids.add(id);
  }
  return ids;
}

function uniqueIdentitiesForNames(events: UsageEventInput[], eventNames: Set<string>): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (!eventNames.has(event.event_name)) continue;
    const id = identity(event);
    if (id) ids.add(id);
  }
  return ids;
}

function defaultWindow(): AdminUsageResponse['window'] {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { key: '7d', from: from.toISOString(), to: to.toISOString() };
}

export function aggregateUsage(input: AggregateUsageInput): AdminUsageResponse {
  const registrations = new Set(input.confirmedUsers.map((user) => user.id)).size;
  const signupEmailRecipients = uniqueIdentities(input.events, 'signup_email_sent');
  const confirmationResenders = uniqueIdentities(input.events, 'confirmation_resend_sent');
  const confirmedUsers = uniqueIdentities(input.events, 'email_confirmation_succeeded');
  const firstLoginUsers = uniqueIdentities(input.events, 'first_login_succeeded');
  const watchlistViewers = uniqueIdentities(input.events, 'watchlist_viewed');
  const activatedUsers = uniqueIdentities(input.events, 'watchlist_stock_added');
  const insightViewers = uniqueIdentities(input.events, 'post_add_insight_viewed');
  const postAddClickers = uniqueIdentities(input.events, 'post_add_ai_clicked');

  const eventCount = (name: string) => input.events.filter((event) => event.event_name === name).length;
  const terminalRuns = input.aiRuns.filter((run) => run.status === 'completed' || run.status === 'failed');
  const completed = input.aiRuns.filter((run) => run.status === 'completed').length;
  const failed = input.aiRuns.filter((run) => run.status === 'failed').length;
  const durations = terminalRuns
    .map((run) => run.duration_ms)
    .filter((duration): duration is number => typeof duration === 'number' && Number.isFinite(duration) && duration >= 0)
    .sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const medianDuration = durations.length === 0
    ? null
    : durations.length % 2 === 1
      ? durations[middle]
      : Math.round((durations[middle - 1] + durations[middle]) / 2);

  const byMethod: Record<string, number> = {};
  for (const run of input.aiRuns) {
    const method = run.method_id || 'unknown';
    byMethod[method] = (byMethod[method] ?? 0) + 1;
  }

  const tickerAdds = new Map<string, number>();
  for (const event of input.events) {
    if (event.event_name !== 'watchlist_stock_added') continue;
    const ticker = typeof event.metadata?.ticker === 'string' ? event.metadata.ticker.trim().toUpperCase() : '';
    if (ticker) tickerAdds.set(ticker, (tickerAdds.get(ticker) ?? 0) + 1);
  }

  const quoteSources: Record<string, SourceHealth> = {};
  const quoteEventNames = new Set(['quote_batch_loaded', 'quote_batch_degraded', 'quote_batch_failed']);
  const quoteEvents = input.events.filter((event) => quoteEventNames.has(event.event_name));
  let failedTickers = 0;
  let stale = 0;
  for (const event of quoteEvents) {
    const metadata = event.metadata ?? {};
    const failedList = Array.isArray(metadata.failed_tickers) ? metadata.failed_tickers.length : 0;
    failedTickers += safeCount(metadata.failed)
      || failedList
      || (event.event_name === 'quote_batch_failed' ? safeCount(metadata.count) : 0);
    stale += safeCount(metadata.stale);
    const sources = metadata.sources;
    if (!sources || typeof sources !== 'object' || Array.isArray(sources)) continue;
    for (const [source, raw] of Object.entries(sources)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const row = raw as Record<string, unknown>;
      const current = quoteSources[source] ?? { attempted: 0, succeeded: 0, failed: 0, duration_ms: 0 };
      current.attempted += safeCount(row.attempted);
      current.succeeded += safeCount(row.succeeded);
      current.failed += safeCount(row.failed);
      current.duration_ms += safeCount(row.duration_ms);
      quoteSources[source] = current;
    }
  }

  return {
    window: input.window ?? defaultWindow(),
    auth_funnel: {
      signup_email_sent: signupEmailRecipients.size,
      confirmation_resenders: confirmationResenders.size,
      confirmed_users: confirmedUsers.size,
      first_login_users: firstLoginUsers.size,
      email_to_confirmation_rate: ratio(confirmedUsers.size, signupEmailRecipients.size),
      confirmation_to_first_login_rate: ratio(firstLoginUsers.size, confirmedUsers.size),
    },
    funnel: {
      registrations,
      watchlist_viewers: watchlistViewers.size,
      activated_users: activatedUsers.size,
      activation_rate: ratio(activatedUsers.size, registrations),
    },
    search: {
      submitted: eventCount('stock_search_submitted'),
      clicked: eventCount('stock_search_result_clicked'),
      force_added: eventCount('stock_force_added'),
      added: eventCount('watchlist_stock_added'),
    },
    ai: {
      total: input.aiRuns.length,
      completed,
      failed,
      completion_rate: ratio(completed, input.aiRuns.length),
      median_duration_ms: medianDuration,
      by_method: byMethod,
      post_add_click_rate: ratio(postAddClickers.size, insightViewers.size),
    },
    popular_tickers: [...tickerAdds.entries()]
      .map(([ticker, adds]) => ({ ticker, adds }))
      .sort((a, b) => b.adds - a.adds || a.ticker.localeCompare(b.ticker))
      .slice(0, 10),
    quotes: {
      batches: quoteEvents.length,
      failed_tickers: failedTickers,
      stale,
      sources: quoteSources,
    },
    operational: {
      latest_checks: [...(input.serviceAlertRuns ?? [])]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 20)
        .map((run) => ({
          check_name: run.check_name,
          status: run.status,
          window_start: run.window_start,
          window_end: run.window_end,
          violation_codes: (run.violations ?? [])
            .map((violation) => typeof violation.code === 'string' ? violation.code : null)
            .filter((code): code is string => Boolean(code)),
          created_at: run.created_at,
        })),
      auth_email_probes: [...(input.authEmailProbes ?? [])]
        .sort((a, b) => b.probe_date.localeCompare(a.probe_date) || a.domain.localeCompare(b.domain))
        .slice(0, 20)
        .map((probe) => ({
          domain: probe.domain,
          probe_date: probe.probe_date,
          signup_delivery: probe.signup_delivery,
          recovery_delivery: probe.recovery_delivery,
        })),
    },
    recent_ai_failures: input.aiRuns
      .filter((run) => run.status === 'failed')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 10)
      .map((run) => ({
        ticker: run.ticker,
        method_id: run.method_id,
        error_code: run.error_code,
        created_at: run.created_at,
      })),
  };
}
