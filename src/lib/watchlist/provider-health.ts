import type { WatchlistProviderReadiness } from './provider-readiness';

export type WatchlistProviderId = WatchlistProviderReadiness['id'];
export type WatchlistProviderCircuitState = 'closed' | 'open' | 'half_open';

export interface WatchlistProviderRuntimeHealth {
  providerId: WatchlistProviderId;
  status: 'passed' | 'failed' | 'skipped';
  consecutiveFailures: number;
  latencyMs: number | null;
  errorCode: string | null;
  circuitState: WatchlistProviderCircuitState;
  lastCheckedAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  nextProbeAt: string | null;
}

export type WatchlistProviderHealthMap = Partial<Record<WatchlistProviderId, WatchlistProviderRuntimeHealth>>;

const PROVIDER_IDS = new Set<WatchlistProviderId>([
  'search', 'hk-financials', 'structured-research', 'official-documents', 'trading-calendar',
  'sec-companyfacts', 'yahoo-chart',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function timestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function count(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseProviderHealth(value: unknown): WatchlistProviderRuntimeHealth | null {
  const item = record(value);
  const providerId = item?.providerId;
  const status = item?.status;
  const circuitState = item?.circuitState;
  const consecutiveFailures = count(item?.consecutiveFailures);
  const latencyMs = item?.latencyMs === null ? null : count(item?.latencyMs);
  const lastCheckedAt = timestamp(item?.lastCheckedAt);
  const lastSuccessAt = timestamp(item?.lastSuccessAt);
  const lastFailureAt = timestamp(item?.lastFailureAt);
  const nextProbeAt = timestamp(item?.nextProbeAt);
  if (typeof providerId !== 'string' || !PROVIDER_IDS.has(providerId as WatchlistProviderId)
    || !['passed', 'failed', 'skipped'].includes(String(status))
    || !['closed', 'open', 'half_open'].includes(String(circuitState))
    || consecutiveFailures === undefined || latencyMs === undefined
    || typeof lastCheckedAt !== 'string' || lastSuccessAt === undefined
    || lastFailureAt === undefined || nextProbeAt === undefined
    || !(item?.errorCode === null || typeof item?.errorCode === 'string')) return null;
  return {
    providerId: providerId as WatchlistProviderId,
    status: status as WatchlistProviderRuntimeHealth['status'],
    consecutiveFailures,
    latencyMs,
    errorCode: item.errorCode as string | null,
    circuitState: circuitState as WatchlistProviderCircuitState,
    lastCheckedAt,
    lastSuccessAt,
    lastFailureAt,
    nextProbeAt,
  };
}

export function parseWatchlistProviderHealth(value: unknown): WatchlistProviderHealthMap {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.flatMap((candidate) => {
    const parsed = parseProviderHealth(candidate);
    return parsed ? [[parsed.providerId, parsed] as const] : [];
  }));
}

export function watchlistProviderRuntimeStatus(
  health: WatchlistProviderRuntimeHealth | null | undefined,
  now = new Date(),
): 'healthy' | 'degraded' | 'unavailable' | 'unknown' {
  if (!health) return 'unknown';
  const age = now.getTime() - Date.parse(health.lastCheckedAt);
  if (!Number.isFinite(age) || age > 24 * 60 * 60_000 || age < -5 * 60_000) return 'unknown';
  if (health.circuitState === 'open') return 'unavailable';
  if (health.status === 'failed' || health.circuitState === 'half_open') return 'degraded';
  if (health.status === 'passed') return 'healthy';
  return 'unknown';
}
