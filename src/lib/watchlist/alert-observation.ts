import type { BrokerReport, Perspective } from '@/lib/supabase/database.types';
import type { RadarPayload } from '@/lib/brief/radar';
import { marketPhase } from '@/lib/today/clock';
import type { WatchlistAlertCandidate, WatchlistAlertObservation } from './alert-evaluator';
import { normalizeWatchlistRating } from './alert-catalog';

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

export function observationFromRadar(
  radar: RadarPayload,
  reports: BrokerReport[] = [],
  perspectives: Perspective[] = [],
  now = new Date(),
): WatchlistAlertObservation {
  const quoteTime = radar.sections.price.updated_at
    ? new Date(radar.sections.price.updated_at).getTime()
    : Number.NaN;
  const age = now.getTime() - quoteTime;
  const phase = marketPhase(radar.market, now).phase;
  const maximumAge = phase === 'open' || phase === 'lunch'
    ? 30 * 60_000
    : phase === 'pre'
      ? 24 * 60 * 60_000
      : 96 * 60 * 60_000;
  const marketDataStatus = radar.sections.price.value == null
    ? 'unavailable'
    : !radar.sections.price.updated_at
      ? 'fresh'
      : !Number.isFinite(age) || age < -5 * 60_000 || age > maximumAge
        ? 'stale'
        : 'fresh';
  return {
    observedAt: radar.sections.price.updated_at || radar.as_of,
    marketDataStatus,
    price: radar.sections.price.value,
    changePct: radar.sections.price.change_pct,
    volumeRatio: radar.sections.price.volume_ratio ?? null,
    peTtm: radar.sections.price.pe_ttm,
    pb: radar.sections.price.pb,
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
