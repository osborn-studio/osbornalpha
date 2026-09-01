import { unstable_cache } from 'next/cache';
import {
  KLINE_RANGE_CONFIG,
  adjustmentSelectable,
  isWithinMarketSession,
  klineBarLimit,
  marketSessionMinutes,
  marketTimezone,
  periodKeyOf,
  type KlineRange,
} from '@/lib/chart/kline';
import { aggregateDailyBars, resampleMinuteBars } from '@/lib/data/kline/aggregate';
import { fetchEastmoneyKline } from '@/lib/data/sources/eastmoney';
import { fetchSinaUsKline } from '@/lib/data/sources/sina';
import { fetchSinaIntradayKline } from '@/lib/data/sources/sina-kline';
import { fetchDatagatewayIntradayKline } from '@/lib/data/sources/datagateway-intraday';
import { fetchTencentKline } from '@/lib/data/sources/tencent';
import { fetchTwseKline } from '@/lib/data/sources/twse';
import { fetchDatagatewayDailyKline, isDatagatewayConfigured, isDatagatewayIntradayConfigured } from '@/lib/data/sources/datagateway';
import type { Market } from '@/lib/supabase/database.types';
import { marketPhase } from '@/lib/today/clock';
import { classifyMarket } from '@/lib/utils';
import {
  KlineProviderError,
  asKlineProviderError,
  type KlineAdjustment,
  type KlineAdjustmentSelection,
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

/** MA warmup closes delivered ahead of the visible daily window. */
const MA_WARMUP_BARS = 20;

export interface KlineResolution {
  bars: SourceKlineBar[];
  source: KlineSourceName;
  adjustment: KlineAdjustment;
  volumeUnit: 'shares';
  previousClose: number | null;
  /** Distinct bars upstream supplied before the visible window was applied. */
  availableBars: number;
  /** Daily closes immediately before the window (interval 'day' only). */
  warmupCloses: number[];
  /** Latest provider bar time, used for metadata when the window is empty. */
  asOfFallback: string;
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
  /** User-selected adjustment for daily-and-longer ranges (A/HK only). */
  adjustment?: KlineAdjustmentSelection;
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

function expectedAdjustment(market: Market, range: KlineRange, requested?: KlineAdjustmentSelection): KlineAdjustment {
  if (KLINE_RANGE_CONFIG[range].interval === 'minute') return 'intraday';
  // The adjustment toggle is only honored where a verified provider serves
  // adjusted history; other markets keep their default and report it in meta.
  if (requested && adjustmentSelectable(market)) return requested;
  return market === 'A' ? 'qfq' : 'none';
}

export function klineProviderRoute(ticker: string, range: KlineRange, adjustment?: KlineAdjustmentSelection): KlineSourceName[] {
  const market = classifyMarket(ticker);
  const interval = KLINE_RANGE_CONFIG[range].interval;
  const history = interval !== 'minute';
  // Weekly/monthly ranges ride the daily routes: Eastmoney serves native
  // weekly/monthly bars while the other providers fall back to aggregation.
  const gateway = history && isDatagatewayConfigured() ? ['datagateway'] as const : [];
  if (market === 'JP' || market === 'KR') return [...gateway];
  if (market === 'TW') {
    if (!history) return [];
    // TWSE/TPEX provide complete OHLCV; DataGateway close history remains a
    // fallback when the exchange feed is unavailable.
    return [/\.TWO$/i.test(ticker) ? 'tpex' : 'twse', ...gateway];
  }
  if (interval === 'minute') {
    const intradayGateway = isDatagatewayIntradayConfigured() ? ['datagateway'] as const : [];
    return market === 'A' ? [...intradayGateway, 'eastmoney', 'sina'] : [...intradayGateway, 'eastmoney'];
  }
  // Back-adjusted (hfq) history is only verified on Eastmoney; keep the
  // Tencent/gateway fallbacks on the qfq/none paths until they are probed.
  if (adjustment === 'hfq' && adjustmentSelectable(market)) return ['eastmoney'];
  // Public exchange feeds provide complete OHLCV. DataGateway's daily
  // history contains closes only, so keep it after those feeds to avoid
  // rendering synthetic candles when a complete series is available.
  if (market === 'A' || market === 'HK') return ['eastmoney', 'tencent', ...gateway];
  return ['eastmoney', 'sina', ...gateway];
}

/** Daily bars requested when a provider must be aggregated into weekly/monthly. */
const WEEKLY_FALLBACK_DAILY_BARS = 1_500;
const MONTHLY_FALLBACK_DAILY_BARS = 1_800;

/** Bars a minute range needs at its target granularity, by market. */
function minuteNeedBars(market: Market, range: KlineRange): number {
  const config = KLINE_RANGE_CONFIG[range];
  const barMinutes = config.granularity === '5m' ? 5 : 1;
  return (marketSessionMinutes(market) * config.sessions) / barMinutes;
}

/** Fetch depth for providers that natively serve the target granularity. */
function nativeMinuteLimit(market: Market, range: KlineRange): number {
  const config = KLINE_RANGE_CONFIG[range];
  const barMinutes = config.granularity === '5m' ? 5 : 1;
  return minuteNeedBars(market, range) + marketSessionMinutes(market) / barMinutes;
}

/** Fetch depth for providers that only serve one-minute bars. */
function oneMinuteLimit(market: Market, range: KlineRange): number {
  const barMinutes = KLINE_RANGE_CONFIG[range].granularity === '5m' ? 5 : 1;
  return Math.min(minuteNeedBars(market, range) * barMinutes + marketSessionMinutes(market), 2_000);
}

/**
 * Validation slice cap for a request: wide enough to cover both the native
 * interval depth and the larger one-minute depth used before resampling.
 */
export function klineFetchDepth(market: Market, range: KlineRange): number {
  const config = KLINE_RANGE_CONFIG[range];
  if (config.interval === 'minute') return Math.max(nativeMinuteLimit(market, range), oneMinuteLimit(market, range));
  if (config.interval === 'day') return config.limit + MA_WARMUP_BARS + 1;
  if (config.interval === 'week') return Math.max(config.limit + 1, WEEKLY_FALLBACK_DAILY_BARS);
  return Math.max(config.limit + 1, MONTHLY_FALLBACK_DAILY_BARS);
}

/** Fetch limit for one provider: native-interval providers ask for less. */
function providerFetchLimit(market: Market, range: KlineRange, nativeInterval: boolean): number {
  const config = KLINE_RANGE_CONFIG[range];
  if (config.interval === 'minute') return nativeInterval ? nativeMinuteLimit(market, range) : oneMinuteLimit(market, range);
  if (config.interval === 'day') return config.limit + MA_WARMUP_BARS + 1;
  if (nativeInterval) return config.limit + 1;
  return config.interval === 'week' ? WEEKLY_FALLBACK_DAILY_BARS : MONTHLY_FALLBACK_DAILY_BARS;
}

function providerDefinitions(request: KlineRequest): KlineProvider[] {
  const market = classifyMarket(request.ticker);
  const config = KLINE_RANGE_CONFIG[request.range];
  const adjustment = expectedAdjustment(market, request.range, request.adjustment);
  const nativeLimit = providerFetchLimit(market, request.range, true);
  const dailyLimit = providerFetchLimit(market, request.range, false);
  const intradayGateway: KlineProvider[] = config.interval === 'minute' && isDatagatewayIntradayConfigured() ? [{
    name: 'datagateway',
    market,
    adjustment,
    timeoutMs: 4_800,
    maxAttempts: 1,
    returnsInterval: 'minute',
    // Wind serves one-minute bars; the resolver resamples to 5m when needed.
    returnsGranularity: '1m',
    fetch: (signal) => fetchDatagatewayIntradayKline(request.ticker, market, dailyLimit, { signal, timeoutMs: 4_500 }),
  }] : [];
  const gateway: KlineProvider[] = config.interval !== 'minute' && isDatagatewayConfigured() ? [{
    name: 'datagateway',
    market,
    adjustment,
    timeoutMs: 2_800,
    maxAttempts: 1,
    returnsInterval: 'day',
    fetch: (signal) => fetchDatagatewayDailyKline(request.ticker, market, dailyLimit, adjustment, { signal, timeoutMs: 2_500 }),
  }] : [];
  if (market === 'JP' || market === 'KR') return gateway;

  if (market === 'TW') {
    if (config.interval === 'minute') return [];
    return [{
      name: /\.TWO$/i.test(request.ticker) ? 'tpex' : 'twse',
      market,
      adjustment,
      timeoutMs: 9_000,
      maxAttempts: 2,
      returnsInterval: 'day',
      fetch: (signal) => fetchTwseKline(request.ticker, 'D', dailyLimit, { signal, timeoutMs: 6_000 }),
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
    // Eastmoney serves every interval natively, including 5m/weekly/monthly.
    returnsInterval: config.interval,
    ...(config.interval === 'minute' ? { returnsGranularity: config.granularity === '5m' ? '5m' as const : '1m' as const } : {}),
    fetch: (signal) => fetchEastmoneyKline(request.ticker, config.providerPeriod, nativeLimit, {
      adjustment,
      signal,
      timeoutMs: 2_500,
    }),
  };
  if (config.interval === 'minute') return [...intradayGateway, primary, ...(market === 'A' ? [{
    name: 'sina' as const,
    market,
    adjustment,
    timeoutMs: 4_800,
    maxAttempts: 1,
    returnsInterval: 'minute' as const,
    returnsGranularity: config.granularity === '5m' ? '5m' as const : '1m' as const,
    fetch: (signal: AbortSignal) => fetchSinaIntradayKline(request.ticker, market, nativeLimit, {
      signal,
      timeoutMs: 4_500,
      granularity: config.granularity === '5m' ? '5m' : '1m',
    }),
  }] : [])];

  if (market === 'A' || market === 'HK') {
    // Back-adjusted history is Eastmoney-verified only (see route comment).
    if (request.adjustment === 'hfq') return [primary];
    return [primary, {
      name: 'tencent',
      market,
      adjustment,
      timeoutMs: 2_800,
      maxAttempts: 2,
      returnsInterval: 'day',
      fetch: (signal) => fetchTencentKline(
        request.ticker,
        dailyLimit,
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
    returnsInterval: 'day',
    // Sina's verified US history payload is substantially larger than the
    // other fallbacks; keep it inside the 9 s request budget but allow the
    // observed 3–4 s response to complete.
    timeoutMs: 4_500,
    maxAttempts: 2,
    fetch: (signal) => fetchSinaUsKline(request.ticker, dailyLimit, signal, 4_200),
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
    const key = `${request.ticker.toUpperCase()}|${request.range}|${request.adjustment ?? ''}`;
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
    const config = KLINE_RANGE_CONFIG[request.range];
    const expected = expectedAdjustment(market, request.range, request.adjustment);
    const need = klineBarLimit(request.ticker, request.range);
    const fetchDepth = klineFetchDepth(market, request.range);
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
          const validated = validateKlineSeries(raw, expected, fetchDepth);

          // Providers without native weekly/monthly history contribute daily
          // bars that are aggregated into the requested interval here; minute
          // providers without native 5m bars are resampled onto the grid.
          let seriesBars = validated.bars;
          let availableBars = validated.availableBars;
          if ((config.interval === 'week' || config.interval === 'month') && provider.returnsInterval !== config.interval) {
            seriesBars = aggregateDailyBars(validated.bars, config.interval);
            availableBars = seriesBars.length;
          }
          if (config.interval === 'minute' && config.granularity === '5m' && provider.returnsGranularity !== '5m') {
            seriesBars = resampleMinuteBars(validated.bars, 5);
            availableBars = seriesBars.length;
          }

          const now = this.now();
          let visibleBars: SourceKlineBar[];
          let previousClose: number | null;
          let warmupCloses: number[] = [];
          if (config.interval === 'minute') {
            // Keep only regular-session minutes (drops pre-open and closing
            // auction bars), then select the latest N trading sessions.
            const sessionBars = seriesBars.filter((bar) => isWithinMarketSession(bar.time, market));
            const source = sessionBars.length > 0 ? sessionBars : seriesBars;
            const dates = Array.from(new Set(source.map((bar) => bar.time.slice(0, 10))));
            const keptDates = dates.slice(-config.sessions);
            const kept = new Set(keptDates);
            visibleBars = source.filter((bar) => kept.has(bar.time.slice(0, 10)));
            previousClose = keptDates.length > 0
              ? source.filter((bar) => bar.time.slice(0, 10) < keptDates[0]).at(-1)?.close ?? null
              : null;
          } else {
            // Calendar window anchored at "now" in the exchange timezone:
            // suspensions and holidays simply leave fewer bars in the window.
            const windowStart = config.calendarDays === null
              ? null
              : localDate(new Date(now.getTime() - config.calendarDays * 86_400_000), market);
            let firstVisible = 0;
            if (windowStart !== null) {
              firstVisible = seriesBars.findIndex((bar) => bar.time.slice(0, 10) >= windowStart);
              if (firstVisible === -1) firstVisible = seriesBars.length;
            }
            visibleBars = seriesBars.slice(firstVisible);
            previousClose = firstVisible > 0 ? seriesBars[firstVisible - 1].close : null;
            if (config.interval === 'day') {
              warmupCloses = seriesBars.slice(Math.max(0, firstVisible - MA_WARMUP_BARS), firstVisible).map((bar) => bar.close);
            }
          }

          // Complete means upstream history reached the depth this range
          // needs — a calendar window holding fewer trading days (holidays,
          // suspensions) is still complete, not partial. "Max" is different:
          // there is no fixed window, so it only counts as complete when the
          // series is untruncated — native monthly history, or an aggregated
          // fallback that exhausted the provider before our daily fetch cap.
          let completeness: 'complete' | 'partial';
          if (request.range === 'max') {
            const aggregatedCapped = (config.interval === 'week' || config.interval === 'month')
              && provider.returnsInterval !== config.interval
              && validated.availableBars >= providerFetchLimit(market, request.range, false);
            completeness = aggregatedCapped ? 'partial' : 'complete';
          } else {
            completeness = availableBars >= need ? 'complete' : 'partial';
          }
          const selected: SourceKlineSeries = {
            source: validated.source,
            adjustment: validated.adjustment,
            volumeUnit: validated.volumeUnit,
            bars: visibleBars,
          };
          if (providerIndex > 0 && prior) assertCompatibleSeries(selected, prior.result);
          this.recordCircuit(provider, true);

          const lastDate = visibleBars.length > 0
            ? visibleBars[visibleBars.length - 1].time.slice(0, 10)
            : seriesBars[seriesBars.length - 1]?.time.slice(0, 10) ?? '';
          const currentDate = localDate(now, market);
          // A forming bar: daily ranges only while the session is open (after
          // the close the day bar is final); weekly/monthly periods stay open
          // across weekends and month ends, so the period-key match alone
          // marks the last bar as still forming.
          const partial = config.interval !== 'minute'
            && visibleBars.length > 0
            && periodKeyOf(config.interval, lastDate) === periodKeyOf(config.interval, currentDate)
            && (config.interval === 'day' ? marketPhase(market, now).phase === 'open' : true);
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
            availableBars,
            warmupCloses,
            asOfFallback: seriesBars[seriesBars.length - 1]?.time ?? '',
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

async function resolveCacheable(
  ticker: string,
  range: KlineRange,
  adjustment?: KlineAdjustmentSelection,
): Promise<KlineResolution> {
  const result = await productionEngine.resolve({ ticker, range, adjustment });
  if (result.freshness === 'stale') throw new StaleKlineResolution(result);
  return result;
}

const cachedIntraday = unstable_cache(
  resolveCacheable,
  ['kline-reliability-intraday-v7'],
  { revalidate: 60 },
);

const cachedDaily = unstable_cache(
  resolveCacheable,
  ['kline-reliability-daily-v5'],
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
    const result = await cached(request.ticker.toUpperCase(), request.range, request.adjustment);
    const ttlMs = KLINE_RANGE_CONFIG[request.range].interval === 'minute' ? 60_000 : 300_000;
    return decorateCachedResolution(result, requestStartedAt, ttlMs);
  } catch (error) {
    if (error instanceof StaleKlineResolution) return error.result;
    throw error;
  }
}
