import { unstable_cache } from 'next/cache';
import {
  KLINE_RANGE_CONFIG,
  klineBarLimit,
  marketTimezone,
  type KlineRange,
} from '@/lib/chart/kline';
import { fetchEastmoneyKline } from '@/lib/data/sources/eastmoney';
import { fetchSinaUsKline } from '@/lib/data/sources/sina';
import { fetchSinaIntradayKline } from '@/lib/data/sources/sina-kline';
import { fetchTencentKline } from '@/lib/data/sources/tencent';
import { fetchTwseKline } from '@/lib/data/sources/twse';
import { fetchDatagatewayDailyKline, isDatagatewayConfigured } from '@/lib/data/sources/datagateway';
import type { Market } from '@/lib/supabase/database.types';
import { marketPhase } from '@/lib/today/clock';
import { classifyMarket } from '@/lib/utils';
import {
  KlineProviderError,
  asKlineProviderError,
  type KlineAdjustment,
  type KlineProvider,
  type KlineProviderFailureKind,
  type KlineSourceName,
  type SourceKlineBar,
  type SourceKlineSeries,
} from './types';
import { assertCompatibleSeries, validateKlineSeries } from './validate';

export type KlineFreshness = 'fresh' | 'stale';
export type KlineCacheStatus = 'none' | 'shared-swr' | 'memory-lkg';
export type KlineWarning = 'fallback_used' | 'stale_cache' | 'partial_coverage' | 'partial_bar';

export interface KlineResolution {
  bars: SourceKlineBar[];
  source: KlineSourceName;
  adjustment: KlineAdjustment;
  volumeUnit: 'shares';
  previousClose: number | null;
  freshness: KlineFreshness;
  fallbackUsed: boolean;
  cacheStatus: KlineCacheStatus;
  completeness: 'complete' | 'partial';
  partial: boolean;
  warnings: KlineWarning[];
  fetchedAt: string;
  cacheAgeSeconds?: number;
  staleAgeSeconds?: number;
}

export interface KlineRequest {
  ticker: string;
  range: KlineRange;
}

export class KlineResolutionError extends Error {
  constructor(
    public readonly code: 'provider_unavailable' | 'invalid_data',
    public readonly status: 502 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'KlineResolutionError';
  }
}

interface LastKnownGood {
  result: KlineResolution;
  storedAt: number;
}

interface CircuitState {
  outcomes: boolean[];
  consecutiveFailures: number;
  openUntil: number;
  openCount: number;
  halfOpenInFlight: boolean;
}

interface EngineOptions {
  providersFor?: (request: KlineRequest) => KlineProvider[];
  now?: () => Date;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxCalls?: number;
  totalBudgetMs?: number;
  staleTtlMs?: number;
  circuitOpenMs?: number;
  globalConcurrency?: number;
  sourceConcurrency?: number;
}

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly capacity: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.capacity) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

function expectedAdjustment(market: Market, range: KlineRange): KlineAdjustment {
  if (range === '1d') return 'intraday';
  return market === 'A' ? 'qfq' : 'none';
}

export function klineProviderRoute(ticker: string, range: KlineRange): KlineSourceName[] {
  const market = classifyMarket(ticker);
  const interval = KLINE_RANGE_CONFIG[range].interval;
  const gateway = interval === 'day' && isDatagatewayConfigured() ? ['datagateway'] as const : [];
  if (market === 'JP' || market === 'KR') return [...gateway];
  if (market === 'TW') {
    if (interval !== 'day') return [];
    // TWSE/TPEX provide complete OHLCV; DataGateway close history remains a
    // fallback when the exchange feed is unavailable.
    return [/\.TWO$/i.test(ticker) ? 'tpex' : 'twse', ...gateway];
  }
  if (interval === 'minute') return market === 'A' ? ['eastmoney', 'sina'] : ['eastmoney'];
  // Public exchange feeds provide complete OHLCV. DataGateway's daily
  // history contains closes only, so keep it after those feeds to avoid
  // rendering synthetic candles when a complete series is available.
  if (market === 'A' || market === 'HK') return ['eastmoney', 'tencent', ...gateway];
  return ['eastmoney', 'sina', ...gateway];
}

function providerDefinitions(request: KlineRequest): KlineProvider[] {
  const market = classifyMarket(request.ticker);
  const config = KLINE_RANGE_CONFIG[request.range];
  // Fetch one look-back bar so the first visible bar can carry an audited
  // previous-close comparison without expanding the requested display range.
  const limit = klineBarLimit(request.ticker, request.range) + 1;
  const adjustment = expectedAdjustment(market, request.range);
  const gateway: KlineProvider[] = config.interval === 'day' && isDatagatewayConfigured() ? [{
    name: 'datagateway',
    market,
    adjustment,
    timeoutMs: 2_800,
    maxAttempts: 1,
    fetch: (signal) => fetchDatagatewayDailyKline(request.ticker, market, limit, adjustment, { signal, timeoutMs: 2_500 }),
  }] : [];
  if (market === 'JP' || market === 'KR') return gateway;

  if (market === 'TW') {
    if (config.interval !== 'day') return [];
    return [{
      name: /\.TWO$/i.test(request.ticker) ? 'tpex' : 'twse',
      market,
      adjustment,
      timeoutMs: 9_000,
      maxAttempts: 2,
      fetch: (signal) => fetchTwseKline(request.ticker, 'D', limit, { signal, timeoutMs: 6_000 }),
    }, ...gateway];
  }

  const primary: KlineProvider = {
    name: 'eastmoney',
    market,
    adjustment,
    timeoutMs: 2_800,
    // A US attempt may probe Eastmoney's 105/106/107 market prefixes internally.
    // Keep it to one provider attempt so a cold US request remains within five HTTP calls.
    maxAttempts: market === 'US' ? 1 : 2,
    fetch: (signal) => fetchEastmoneyKline(request.ticker, config.providerPeriod, limit, {
      adjustment,
      signal,
      timeoutMs: 2_500,
    }),
  };
  if (config.interval === 'minute') return [primary, ...(market === 'A' ? [{
    name: 'sina' as const,
    market,
    adjustment,
    timeoutMs: 4_800,
    maxAttempts: 1,
    fetch: (signal: AbortSignal) => fetchSinaIntradayKline(request.ticker, market, limit, { signal, timeoutMs: 4_500 }),
  }] : [])];

  if (market === 'A' || market === 'HK') {
    return [primary, {
      name: 'tencent',
      market,
      adjustment,
      timeoutMs: 2_800,
      maxAttempts: 2,
      fetch: (signal) => fetchTencentKline(
        request.ticker,
        limit,
        adjustment as Extract<KlineAdjustment, 'qfq' | 'none'>,
        signal,
        2_500,
      ),
    }, ...gateway];
  }
  return [primary, {
    name: 'sina',
    market,
    adjustment,
    // Sina's verified US history payload is substantially larger than the
    // other fallbacks; keep it inside the 9 s request budget but allow the
    // observed 3–4 s response to complete.
    timeoutMs: 4_500,
    maxAttempts: 2,
    fetch: (signal) => fetchSinaUsKline(request.ticker, limit, signal, 4_200),
  }, ...gateway];
}

function localDate(now: Date, market: Market): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: marketTimezone(market),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function isCircuitFailure(kind: KlineProviderFailureKind): boolean {
  return kind === 'rate_limited' || kind === 'transient' || kind === 'protocol' || kind === 'invalid_data';
}

export class KlineReliabilityEngine {
  private readonly providersFor: (request: KlineRequest) => KlineProvider[];
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxCalls: number;
  private readonly totalBudgetMs: number;
  private readonly staleTtlMs: number;
  private readonly circuitOpenMs: number;
  private readonly globalSemaphore: Semaphore;
  private readonly sourceConcurrency: number;
  private readonly sourceSemaphores = new Map<KlineSourceName, Semaphore>();
  private readonly circuits = new Map<string, CircuitState>();
  private readonly lastKnownGood = new Map<string, LastKnownGood>();
  private readonly inflight = new Map<string, Promise<KlineResolution>>();

  constructor(options: EngineOptions = {}) {
    this.providersFor = options.providersFor ?? providerDefinitions;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxCalls = options.maxCalls ?? 5;
    this.totalBudgetMs = options.totalBudgetMs ?? 9_000;
    this.staleTtlMs = options.staleTtlMs ?? 30 * 24 * 60 * 60 * 1_000;
    this.circuitOpenMs = options.circuitOpenMs ?? 30_000;
    this.globalSemaphore = new Semaphore(options.globalConcurrency ?? 8);
    this.sourceConcurrency = options.sourceConcurrency ?? 2;
  }

  resolve(request: KlineRequest): Promise<KlineResolution> {
    const key = `${request.ticker.toUpperCase()}|${request.range}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const promise = this.resolveInternal(request, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private sourceSemaphore(source: KlineSourceName): Semaphore {
    let semaphore = this.sourceSemaphores.get(source);
    if (!semaphore) {
      semaphore = new Semaphore(this.sourceConcurrency);
      this.sourceSemaphores.set(source, semaphore);
    }
    return semaphore;
  }

  private circuitKey(provider: KlineProvider): string {
    return `${provider.name}:${provider.market}`;
  }

  private circuit(provider: KlineProvider): CircuitState {
    const key = this.circuitKey(provider);
    let state = this.circuits.get(key);
    if (!state) {
      state = { outcomes: [], consecutiveFailures: 0, openUntil: 0, openCount: 0, halfOpenInFlight: false };
      this.circuits.set(key, state);
    }
    return state;
  }

  private recordCircuit(provider: KlineProvider, success: boolean): void {
    const state = this.circuit(provider);
    if (success) {
      const recoveredFromOpenCircuit = state.openUntil > 0;
      if (recoveredFromOpenCircuit) state.outcomes = [];
      else {
        state.outcomes.push(true);
        if (state.outcomes.length > 20) state.outcomes.shift();
      }
      state.consecutiveFailures = 0;
      state.openUntil = 0;
      state.openCount = 0;
      return;
    }
    state.outcomes.push(success);
    if (state.outcomes.length > 20) state.outcomes.shift();
    state.consecutiveFailures += 1;
    const failureCount = state.outcomes.filter((outcome) => !outcome).length;
    if (state.openUntil > 0 || state.consecutiveFailures >= 5 || (state.outcomes.length >= 10 && failureCount / state.outcomes.length > 0.5)) {
      state.openCount += 1;
      const cooldownMs = Math.min(this.circuitOpenMs * (2 ** (state.openCount - 1)), 5 * 60_000);
      state.openUntil = this.now().getTime() + cooldownMs;
    }
  }

  private async callProvider(provider: KlineProvider, remainingMs: number): Promise<SourceKlineSeries | null> {
    const state = this.circuit(provider);
    if (state.openUntil > this.now().getTime()) {
      throw new KlineProviderError('transient', `${provider.name} circuit is open`, false, undefined, true);
    }
    const halfOpen = state.openUntil > 0;
    if (halfOpen && state.halfOpenInFlight) {
      throw new KlineProviderError('transient', `${provider.name} circuit half-open probe is busy`, false, undefined, true);
    }
    if (halfOpen) state.halfOpenInFlight = true;
    const timeoutMs = Math.max(1, Math.min(provider.timeoutMs, remainingMs));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.globalSemaphore.run(() => this.sourceSemaphore(provider.name).run(() => provider.fetch(controller.signal)));
    } finally {
      clearTimeout(timer);
      if (halfOpen) state.halfOpenInFlight = false;
    }
  }

  private async resolveInternal(request: KlineRequest, key: string): Promise<KlineResolution> {
    const startedAt = Date.now();
    const providers = this.providersFor(request);
    const market = classifyMarket(request.ticker);
    const expected = expectedAdjustment(market, request.range);
    const limit = klineBarLimit(request.ticker, request.range);
    const providerLimit = limit + 1;
    const prior = this.lastKnownGood.get(key);
    let calls = 0;
    let sawInvalidData = false;

    for (let providerIndex = 0; providerIndex < providers.length && calls < this.maxCalls; providerIndex += 1) {
      const provider = providers[providerIndex];
      for (let attempt = 0; attempt < provider.maxAttempts && calls < this.maxCalls; attempt += 1) {
        const elapsed = Date.now() - startedAt;
        const remainingMs = this.totalBudgetMs - elapsed;
        if (remainingMs <= 0) break;
        calls += 1;
        try {
          const raw = await this.callProvider(provider, remainingMs);
          if (!raw) throw new KlineProviderError('empty', `${provider.name} returned no K-line data`);
          const validated = validateKlineSeries(raw, expected, providerLimit);
          let visibleBars: SourceKlineBar[];
          let previousClose: number | null;
          if (request.range === '1d') {
            const latestSession = validated.bars[validated.bars.length - 1].time.slice(0, 10);
            const sessionBars = validated.bars.filter((bar) => bar.time.startsWith(latestSession));
            visibleBars = sessionBars.slice(-limit);
            previousClose = validated.bars
              .filter((bar) => bar.time.slice(0, 10) < latestSession)
              .at(-1)?.close ?? null;
          } else {
            visibleBars = validated.bars.slice(-limit);
            previousClose = validated.bars.length > visibleBars.length
              ? validated.bars[validated.bars.length - visibleBars.length - 1].close
              : null;
          }
          const completeness = visibleBars.length >= limit ? 'complete' : 'partial';
          const selected: SourceKlineSeries = {
            source: validated.source,
            adjustment: validated.adjustment,
            volumeUnit: validated.volumeUnit,
            bars: visibleBars,
          };
          if (providerIndex > 0 && prior) assertCompatibleSeries(selected, prior.result);
          this.recordCircuit(provider, true);

          const now = this.now();
          const lastDate = visibleBars[visibleBars.length - 1].time.slice(0, 10);
          const partial = KLINE_RANGE_CONFIG[request.range].interval === 'day'
            && lastDate === localDate(now, market)
            && marketPhase(market, now).phase === 'open';
          const warnings: KlineWarning[] = [];
          if (providerIndex > 0) warnings.push('fallback_used');
          if (completeness === 'partial') warnings.push('partial_coverage');
          if (partial) warnings.push('partial_bar');
          const result: KlineResolution = {
            bars: visibleBars,
            source: selected.source,
            adjustment: selected.adjustment,
            volumeUnit: selected.volumeUnit,
            previousClose,
            freshness: 'fresh',
            fallbackUsed: providerIndex > 0,
            cacheStatus: 'none',
            completeness,
            partial,
            warnings,
            fetchedAt: now.toISOString(),
          };
          this.lastKnownGood.set(key, { result, storedAt: now.getTime() });
          return result;
        } catch (error) {
          const failure = asKlineProviderError(error);
          if (failure.kind === 'invalid_data' || failure.kind === 'protocol') sawInvalidData = true;
          if (isCircuitFailure(failure.kind) && !failure.circuitOpen) this.recordCircuit(provider, false);
          const canRetry = failure.retryable && attempt + 1 < provider.maxAttempts && calls < this.maxCalls;
          if (!canRetry) break;
          const backoffMs = 150 + Math.floor(this.random() * 201);
          if (Date.now() - startedAt + backoffMs >= this.totalBudgetMs) break;
          await this.sleep(backoffMs);
        }
      }
    }

    const staleAgeMs = prior ? this.now().getTime() - prior.storedAt : Number.POSITIVE_INFINITY;
    if (prior && staleAgeMs <= this.staleTtlMs) {
      return {
        ...prior.result,
        freshness: 'stale',
        cacheStatus: 'memory-lkg',
        cacheAgeSeconds: Math.max(0, Math.floor(staleAgeMs / 1_000)),
        staleAgeSeconds: Math.max(0, Math.floor(staleAgeMs / 1_000)),
        warnings: Array.from(new Set([...prior.result.warnings, 'stale_cache'])) as KlineWarning[],
      };
    }
    throw new KlineResolutionError(
      sawInvalidData ? 'invalid_data' : 'provider_unavailable',
      sawInvalidData ? 502 : 503,
      sawInvalidData ? 'All K-line providers returned invalid data' : 'All K-line providers are unavailable',
    );
  }
}

const productionEngine = new KlineReliabilityEngine();

class StaleKlineResolution extends Error {
  constructor(public readonly result: KlineResolution) {
    super('Do not store instance last-known-good data in the shared Data Cache');
    this.name = 'StaleKlineResolution';
  }
}

async function resolveCacheable(ticker: string, range: KlineRange): Promise<KlineResolution> {
  const result = await productionEngine.resolve({ ticker, range });
  if (result.freshness === 'stale') throw new StaleKlineResolution(result);
  return result;
}

const cachedIntraday = unstable_cache(
  resolveCacheable,
  ['kline-reliability-intraday-v3'],
  { revalidate: 60 },
);

const cachedDaily = unstable_cache(
  resolveCacheable,
  ['kline-reliability-daily-v3'],
  { revalidate: 300 },
);

export function decorateCachedResolution(
  result: KlineResolution,
  requestStartedAt: number,
  ttlMs: number,
): KlineResolution {
  if (result.cacheStatus === 'memory-lkg') return result;
  const fetchedAt = Date.parse(result.fetchedAt);
  const cacheAgeMs = Number.isFinite(fetchedAt) ? Math.max(0, requestStartedAt - fetchedAt) : 0;
  const fromSharedCache = Number.isFinite(fetchedAt) && fetchedAt < requestStartedAt;
  const expired = fromSharedCache && cacheAgeMs > ttlMs;
  return {
    ...result,
    freshness: expired ? 'stale' : result.freshness,
    cacheStatus: fromSharedCache ? 'shared-swr' : 'none',
    ...(fromSharedCache ? { cacheAgeSeconds: Math.floor(cacheAgeMs / 1_000) } : {}),
    ...(expired ? { staleAgeSeconds: Math.floor(cacheAgeMs / 1_000) } : {}),
    warnings: expired
      ? Array.from(new Set([...result.warnings, 'stale_cache'])) as KlineWarning[]
      : result.warnings,
  };
}

export async function resolveKline(request: KlineRequest): Promise<KlineResolution> {
  const requestStartedAt = Date.now();
  const cached = KLINE_RANGE_CONFIG[request.range].interval === 'minute' ? cachedIntraday : cachedDaily;
  try {
    const result = await cached(request.ticker.toUpperCase(), request.range);
    const ttlMs = KLINE_RANGE_CONFIG[request.range].interval === 'minute' ? 60_000 : 300_000;
    return decorateCachedResolution(result, requestStartedAt, ttlMs);
  } catch (error) {
    if (error instanceof StaleKlineResolution) return error.result;
    throw error;
  }
}
