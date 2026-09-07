import type { BrokerReport, Perspective, WatchlistMetricSnapshot } from '@/lib/supabase/database.types';
import type { RadarPayload } from '@/lib/brief/radar';
import type { CalendarPayload } from '@/lib/brief/calendar';
import type { QuoteShape } from '@/lib/quotes/resolve-quote';
import { marketPhase } from '@/lib/today/clock';
import { builtInMarketCalendar, type MarketCalendarProvider } from '@/lib/market/calendar';
import { classifyMarket } from '@/lib/utils';
import type { WatchlistAlertCandidate, WatchlistAlertObservation } from './alert-evaluator';
import { normalizeWatchlistRating } from './alert-catalog';
import {
  WATCHLIST_METRIC_ALERT_KEYS,
  WATCHLIST_PEER_ALERT_KEYS,
  watchlistPeerMetricAlertValue,
  watchlistMetricAlertValue,
  watchlistMetricSnapshotStatus,
} from './alert-metrics';
import type { DataEnvelope } from './overview-contract';
import type { WatchlistPeerMetrics } from './peer-metrics';

function dateKey(value: string | null | undefined): string {
  return value || 'unknown-date';
}

export function reportCandidates(reports: BrokerReport[]): WatchlistAlertCandidate[] {
  return reports.map((report) => ({
    key: report.id,
    kind: 'broker_report',
    label: [report.broker, report.rating].filter(Boolean).join(' - ') || 'Broker report',
    occurredAt: report.published_at ?? report.fetched_at,
    value: normalizeWatchlistRating(report.rating),
    payload: {
      broker: report.broker,
      rating: report.rating,
      normalizedRating: normalizeWatchlistRating(report.rating),
      targetPrice: report.target_price,
      targetChangePct: report.target_change_pct,
      url: report.pdf_url,
    },
  }));
}

export function perspectiveCandidates(perspectives: Perspective[]): WatchlistAlertCandidate[] {
  return perspectives.map((perspective) => ({
    key: perspective.id,
    kind: perspective.persona,
    label: perspective.summary || `${perspective.persona}: ${perspective.stance}`,
    occurredAt: perspective.created_at,
    value: perspective.stance,
    payload: {
      persona: perspective.persona,
      stance: perspective.stance,
      confidence: perspective.confidence,
      cites: perspective.cites,
    },
  }));
}

function emptyObservation(observedAt: string): WatchlistAlertObservation {
  return {
    observedAt,
    marketDataStatus: 'unavailable',
    price: null,
    changePct: null,
    volumeRatio: null,
    peTtm: null,
    pb: null,
    metrics: {},
    events: [],
    ratings: [],
    perspectives: [],
  };
}

export function observationFromMetricSnapshot(
  snapshot: WatchlistMetricSnapshot | null,
  now = new Date(),
): WatchlistAlertObservation {
  const observedAt = snapshot?.observed_at ?? snapshot?.generated_at ?? now.toISOString();
  return {
    ...emptyObservation(observedAt),
    metricDataStatus: watchlistMetricSnapshotStatus(snapshot, now),
    metrics: Object.fromEntries(
      WATCHLIST_METRIC_ALERT_KEYS.map((key) => [key, watchlistMetricAlertValue(snapshot, key)]),
    ),
  };
}

export function observationFromPeerMetrics(
  envelope: DataEnvelope<WatchlistPeerMetrics> | null,
  now = new Date(),
): WatchlistAlertObservation {
  const observedAt = envelope?.asOf ?? now.toISOString();
  return {
    ...emptyObservation(observedAt),
    metricDataStatus: envelope?.status === 'fresh' || envelope?.status === 'delayed'
      ? 'fresh'
      : envelope?.status === 'stale' ? 'stale' : 'unavailable',
    metrics: Object.fromEntries(
      WATCHLIST_PEER_ALERT_KEYS.map((key) => [key, watchlistPeerMetricAlertValue(envelope, key)]),
    ),
  };
}

export function observationFromQuote(
  ticker: string,
  quote: QuoteShape | null,
  now = new Date(),
  calendar: MarketCalendarProvider = builtInMarketCalendar,
): WatchlistAlertObservation {
  const observedAt = quote?.updated_at || now.toISOString();
  const quoteTime = quote?.updated_at ? new Date(quote.updated_at).getTime() : Number.NaN;
  const age = now.getTime() - quoteTime;
  const phase = marketPhase(quote?.market ?? classifyMarket(ticker), now, calendar).phase;
  const maximumAge = phase === 'open' || phase === 'lunch'
    ? 30 * 60_000
    : phase === 'pre'
      ? 24 * 60 * 60_000
      : 96 * 60 * 60_000;
  const marketDataStatus = !quote
    ? 'unavailable'
    : !quote.updated_at
      ? 'fresh'
      : !Number.isFinite(age) || age < -5 * 60_000 || age > maximumAge
        ? 'stale'
        : 'fresh';
  return {
    ...emptyObservation(observedAt),
    marketDataStatus,
    price: quote?.price ?? null,
    changePct: quote?.change_pct ?? null,
    volumeRatio: quote?.volume_ratio ?? null,
    peTtm: quote?.pe_ttm ?? null,
    pb: quote?.pb ?? null,
  };
}

export function observationFromResearch(
  calendar: CalendarPayload | null,
  reports: BrokerReport[] = [],
  perspectives: Perspective[] = [],
  now = new Date(),
): WatchlistAlertObservation {
  return {
    ...emptyObservation(now.toISOString()),
    events: (calendar?.events ?? []).map((event) => ({
      key: `${event.kind}:${dateKey(event.date)}`,
      kind: event.kind,
      label: event.title,
      occurredAt: event.date,
      payload: { daysUntil: event.days_until },
    })),
    ratings: reportCandidates(reports),
    perspectives: perspectiveCandidates(perspectives),
  };
}

export function observationFromRadar(
  radar: RadarPayload,
  reports: BrokerReport[] = [],
  perspectives: Perspective[] = [],
  now = new Date(),
): WatchlistAlertObservation {
  const quoteObservation = observationFromQuote(radar.ticker, {
    source: radar.sections.price.source,
    ticker: radar.ticker,
    name: radar.name,
    market: radar.market,
    currency: radar.sections.price.currency,
    price: radar.sections.price.value ?? 0,
    change: 0,
    change_pct: radar.sections.price.change_pct ?? 0,
    open: 0,
    high: 0,
    low: 0,
    prev_close: 0,
    volume: 0,
    amount: 0,
    amplitude: 0,
    market_cap: null,
    market_cap_label: radar.sections.price.market_cap_label,
    pe_ttm: radar.sections.price.pe_ttm,
    pb: radar.sections.price.pb,
    turnover: null,
    volume_ratio: radar.sections.price.volume_ratio ?? null,
    updated_at: radar.sections.price.updated_at ?? radar.as_of,
    delayed: radar.sections.price.delayed ?? false,
  }, now);
  return {
    ...quoteObservation,
    price: radar.sections.price.value,
    events: radar.sections.calendar.upcoming.map((event) => ({
      key: `${event.kind}:${dateKey(event.date)}`,
      kind: event.kind,
      label: event.title,
      occurredAt: event.date,
      payload: { daysUntil: event.days_until },
    })),
    ratings: reportCandidates(reports),
    perspectives: perspectiveCandidates(perspectives),
  };
}
