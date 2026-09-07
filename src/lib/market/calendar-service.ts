import type { Market, MarketCalendarOverrideRow } from '@/lib/supabase/database.types';
import {
  builtInMarketCalendar,
  createMarketCalendar,
  type MarketCalendarProvider,
  type MarketSessionOverride,
  type MarketSessionWindow,
} from './calendar';

export interface ExchangeCalendarSnapshot {
  source: string;
  sourceUpdatedAt: string | null;
  coverage: {
    from: string;
    to: string;
    markets: Market[];
    complete: boolean;
  };
  entries: Array<{
    market: Market;
    date: string;
    override: MarketSessionOverride;
  }>;
}

export type MarketCalendarDatabase = object;

const MARKETS = new Set<Market>(['A', 'HK', 'US', 'JP', 'KR', 'TW']);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sessions(value: unknown): MarketSessionWindow[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null;
  const parsed = value.map((candidate) => {
    const row = record(candidate);
    const open = Number(row?.open);
    const close = Number(row?.close);
    return Number.isInteger(open) && Number.isInteger(close) && open >= 0 && close <= 1440 && open < close
      ? { open, close }
      : null;
  });
  if (!parsed.every((value): value is MarketSessionWindow => value !== null)) return null;
  return parsed.every((window, index) => index === 0 || parsed[index - 1]!.close <= window.open) ? parsed : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function markets(value: unknown): Market[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((market): market is Market => typeof market === 'string' && MARKETS.has(market as Market))) return null;
  return new Set(value).size === value.length ? value : null;
}

export function parseExchangeCalendarSnapshot(value: unknown): ExchangeCalendarSnapshot {
  const payload = record(value);
  const coverage = record(payload?.coverage);
  if (!payload || typeof payload.source !== 'string' || !payload.source.trim() || !Array.isArray(payload.entries)
    || (payload.sourceUpdatedAt !== null && payload.sourceUpdatedAt !== undefined && typeof payload.sourceUpdatedAt !== 'string')) {
    throw new Error('invalid_exchange_calendar_snapshot');
  }
  const coverageFrom = coverage?.from;
  const coverageTo = coverage?.to;
  const coverageMarkets = markets(coverage?.markets);
  const coverageComplete = coverage?.complete;
  if (!validDate(coverageFrom) || !validDate(coverageTo) || coverageFrom > coverageTo
    || !coverageMarkets || typeof coverageComplete !== 'boolean') {
    throw new Error('invalid_exchange_calendar_coverage');
  }
  const seen = new Set<string>();
  const entries = payload.entries.map((candidate) => {
    const row = record(candidate);
    const market = row?.market;
    const date = row?.date;
    const kind = row?.kind;
    const name = row?.name;
    if (!row || typeof market !== 'string' || !MARKETS.has(market as Market)
      || !validDate(date)
      || (kind !== 'closed' && kind !== 'sessions')
      || typeof name !== 'string' || name.trim().length === 0 || name.length > 160) {
      throw new Error('invalid_exchange_calendar_entry');
    }
    const key = `${market}:${date}`;
    if (seen.has(key) || date < coverageFrom || date > coverageTo
      || !coverageMarkets.includes(market as Market)) throw new Error('invalid_exchange_calendar_entry');
    seen.add(key);
    const windows = kind === 'sessions' ? sessions(row.sessions) : [];
    if (kind === 'sessions' && !windows) throw new Error('invalid_exchange_calendar_sessions');
    return {
      market: market as Market,
      date,
      override: kind === 'closed'
        ? { kind: 'closed' as const, name }
        : { kind: 'sessions' as const, name, sessions: windows! },
    };
  });
  return {
    source: payload.source.slice(0, 100),
    sourceUpdatedAt: typeof payload.sourceUpdatedAt === 'string' ? payload.sourceUpdatedAt : null,
    coverage: {
      from: coverageFrom,
      to: coverageTo,
      markets: coverageMarkets,
      complete: coverageComplete,
    },
    entries,
  };
}

export function assertExchangeCalendarCoverage(snapshot: ExchangeCalendarSnapshot, from: string, to: string): void {
  if (!snapshot.coverage.complete || snapshot.coverage.from > from || snapshot.coverage.to < to
    || [...MARKETS].some((market) => !snapshot.coverage.markets.includes(market))) {
    throw new Error('incomplete_exchange_calendar_snapshot');
  }
}

export async function fetchExchangeCalendarSnapshot(
  baseUrl: string,
  from: string,
  to: string,
  options: { apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ExchangeCalendarSnapshot> {
  const url = new URL(baseUrl);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
      headers: options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : undefined,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`exchange_calendar_http_${response.status}`);
    const snapshot = parseExchangeCalendarSnapshot(await response.json());
    assertExchangeCalendarCoverage(snapshot, from, to);
    return snapshot;
  } finally {
    clearTimeout(timeout);
  }
}

export async function persistExchangeCalendarSnapshot(
  db: MarketCalendarDatabase,
  snapshot: ExchangeCalendarSnapshot,
  fetchedAt = new Date(),
): Promise<number> {
  assertExchangeCalendarCoverage(snapshot, snapshot.coverage.from, snapshot.coverage.to);
  const rows: MarketCalendarOverrideRow[] = snapshot.entries.map((entry) => ({
    market: entry.market,
    date_key: entry.date,
    kind: entry.override.kind,
    name: entry.override.name,
    sessions: entry.override.kind === 'sessions' ? [...entry.override.sessions] : [],
    source: snapshot.source,
    source_updated_at: snapshot.sourceUpdatedAt,
    fetched_at: fetchedAt.toISOString(),
  }));
  const repository = db as {
    rpc(name: 'replace_market_calendar_overrides', args: {
      p_rows: MarketCalendarOverrideRow[];
      p_source: string;
      p_from: string;
      p_to: string;
      p_markets: Market[];
    }): Promise<{ data: number | null; error: { message: string } | null }>;
  };
  const { data, error } = await repository.rpc('replace_market_calendar_overrides', {
    p_rows: rows,
    p_source: snapshot.source,
    p_from: snapshot.coverage.from,
    p_to: snapshot.coverage.to,
    p_markets: snapshot.coverage.markets,
  });
  if (error) throw new Error(`market_calendar_persist_failed:${error.message}`);
  return data ?? rows.length;
}

export async function loadStoredMarketCalendar(
  db: MarketCalendarDatabase,
  now = new Date(),
  fallback: MarketCalendarProvider = builtInMarketCalendar,
): Promise<MarketCalendarProvider> {
  const from = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const repository = db as {
    from(name: 'market_calendar_overrides'): {
      select(columns: string): {
        gte(column: 'date_key', value: string): {
          lte(column: 'date_key', value: string): Promise<{ data: MarketCalendarOverrideRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await repository.from('market_calendar_overrides').select('*')
    .gte('date_key', from).lte('date_key', to);
  if (error) throw new Error(`market_calendar_load_failed:${error.message}`);
  const overrides = Object.fromEntries((data ?? []).map((row) => [
    `${row.market}:${row.date_key}`,
    row.kind === 'closed'
      ? { kind: 'closed' as const, name: row.name }
      : { kind: 'sessions' as const, name: row.name, sessions: row.sessions },
  ]));
  return createMarketCalendar(overrides, fallback);
}
