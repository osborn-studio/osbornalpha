'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import {
  KLINE_RANGES,
  klineRangeAvailability,
  type KlineBar,
  type KlineMeta,
  type KlineRange,
} from '@/lib/chart/kline';
import { useKline } from '@/lib/hooks/useQuote';
import { chartStatusKeys, sourceTranslationKey } from './kline-chart-meta';

const RANGE_LABELS: Record<KlineRange, string> = { '1d': '1D', '5d': '5D', '1m': '1M', '3m': '3M', '1y': '1Y', '5y': '5Y', max: 'Max' };

type HoverSnapshot = KlineBar;

/**
 * Moving average over the visible bars, optionally seeded with warmup closes
 * delivered ahead of the window so short ranges still get a full MA20 line.
 */
function computeMA(data: Array<{ time: number; close: number }>, period: number, warmupCloses: number[] = []) {
  const closes = [...warmupCloses, ...data.map((bar) => bar.close)];
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  for (let i = 0; i < data.length; i++) {
    const end = warmupCloses.length + i;
    const start = end - period + 1;
    if (start < 0) continue;
    let sum = 0;
    for (let j = start; j <= end; j++) sum += closes[j];
    out.push({ time: data[i].time as UTCTimestamp, value: sum / period });
  }
  return out;
}

function inferPrecision(bars: KlineBar[]): number {
  let precision = 0;
  for (const bar of bars.slice(-40)) {
    for (const value of [bar.open, bar.high, bar.low, bar.close]) {
      const text = value.toFixed(6).replace(/0+$/, '');
      precision = Math.max(precision, text.includes('.') ? text.split('.')[1].length : 0);
    }
  }
  return Math.min(Math.max(precision, 0), 4);
}

function hoverSnapshot(bars: KlineBar[], index: number): HoverSnapshot {
  return bars[index];
}

function cssVariable(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function formatChartTime(time: number, interval: KlineMeta['interval'], locale: string): string {
  const date = new Date(time * 1_000);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(interval === 'minute' ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date);
}

function formatFetchedAt(value: string, timezone: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function KlineChart({ ticker }: { ticker: string }) {
  const t = useTranslations('market.stock.chart');
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<KlineRange>('3m');
  const [visualRevision, setVisualRevision] = useState(0);
  const [hovered, setHovered] = useState<HoverSnapshot | null>(null);
  const { bars, loading, error, errorCode, meta, refetch } = useKline(ticker, range);
  const displayMeta = meta;
  const unsupportedReason = klineRangeAvailability(ticker, range);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === 'class' || mutation.attributeName === 'data-color-scheme')) {
        setVisualRevision((revision) => revision + 1);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-color-scheme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (bars.length === 0) setHovered(null);
  }, [bars]);

  useEffect(() => {
    let chart: IChartApi | null = null;
    let observer: ResizeObserver | null = null;
    let cancelled = false;

    (async () => {
      const container = containerRef.current;
      if (!container || bars.length === 0 || !displayMeta) return;
      const lwc = await import('lightweight-charts');
      if (cancelled || !containerRef.current) return;
      container.innerHTML = '';

      const upColor = cssVariable('--up', '#ef4444');
      const downColor = cssVariable('--down', '#10b981');
      const textColor = cssVariable('--text-dim', '#a1a1aa');
      const gridColor = cssVariable('--border', 'rgba(255,255,255,0.08)');
      const precision = displayMeta.pricePrecision;
      const minMove = displayMeta.minMove;
      const volumeFormatter = (value: number) => new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(value);

      chart = lwc.createChart(container, {
        width: Math.max(container.clientWidth, 1),
        height: Math.max(container.clientHeight, 1),
        layout: { background: { color: 'transparent' }, textColor, fontFamily: 'system-ui' },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        timeScale: { borderColor: gridColor, timeVisible: displayMeta.interval === 'minute', secondsVisible: false },
        rightPriceScale: { borderColor: gridColor },
        crosshair: { mode: lwc.CrosshairMode.Normal },
      });
      chartRef.current = chart;

      const candles = chart.addCandlestickSeries({
        upColor,
        downColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor,
        priceFormat: { type: 'price', precision, minMove },
      });
      candles.setData(bars.map(({ time, open, high, low, close }) => ({
        time: time as UTCTimestamp,
        open,
        high,
        low,
        close,
      })));

      // Intraday benchmark: the audited previous-session close grounds the
      // day's strength at a glance (standard time-share chart convention).
      if (range === '1d' && bars[0]?.previousClose != null) {
        candles.createPriceLine({
          price: bars[0].previousClose,
          color: cssVariable('--text-muted', '#a1a1aa'),
          lineWidth: 1,
          lineStyle: lwc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: t('prevClose'),
        });
      }

      if (displayMeta.interval !== 'minute') {
        const warmup = displayMeta.maWarmupCloses ?? [];
        const ma5 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'MA5', priceFormat: { type: 'price', precision, minMove } });
        ma5.setData(computeMA(bars, 5, warmup));
        const ma20 = chart.addLineSeries({ color: '#58a6ff', lineWidth: 1, title: 'MA20', priceFormat: { type: 'price', precision, minMove } });
        ma20.setData(computeMA(bars, 20, warmup));
      }

      const volume = chart.addHistogramSeries({
        priceFormat: { type: 'custom', minMove: 1, formatter: volumeFormatter },
        priceScaleId: '',
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volume.setData(bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.volume,
        color: bar.close >= bar.open ? `${upColor}80` : `${downColor}80`,
      })));

      const indexByTime = new Map(bars.map((bar, index) => [bar.time, index]));
      setHovered(hoverSnapshot(bars, bars.length - 1));
      chart.subscribeCrosshairMove((param) => {
        if (typeof param.time !== 'number') {
          setHovered(hoverSnapshot(bars, bars.length - 1));
          return;
        }
        const index = indexByTime.get(param.time);
        if (index !== undefined) setHovered(hoverSnapshot(bars, index));
      });
      chart.timeScale().fitContent();

      observer = new ResizeObserver(([entry]) => {
        const width = Math.floor(entry.contentRect.width);
        const height = Math.floor(entry.contentRect.height);
        if (width > 0 && height > 0) chart?.applyOptions({ width, height });
      });
      observer.observe(container);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (chartRef.current === chart) chartRef.current = null;
      chart?.remove();
    };
  }, [bars, displayMeta, locale, range, t, visualRevision]);

  const errorMessage = errorCode && [
    'market_unsupported',
    'intraday_unsupported',
    'history_unsupported',
    'provider_unavailable',
    'invalid_data',
  ].includes(errorCode)
    ? t(`errors.${errorCode}`)
    : error ? t('errors.loadFailed') : t('errors.noData');
  const precision = displayMeta?.pricePrecision ?? inferPrecision(bars);
  const priceFormatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  const volumeFormatter = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 });
  const currency = displayMeta?.currencyCode || displayMeta?.currency || '';
  const volumeUnit = displayMeta?.volumeUnit ?? 'shares';

  return (
    <div data-testid="kline-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-text-muted">{t('rangeLabel')}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            disabled={bars.length === 0}
            className="rounded px-2 py-1 text-xs text-text-dim transition hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('resetView')}
          </button>
          <div className="inline-flex rounded-md bg-bg-card p-0.5" role="group" aria-label={t('rangeAriaLabel')}>
            {KLINE_RANGES.map((item) => {
              const unavailable = klineRangeAvailability(ticker, item);
              const reason = unavailable ? t(`errors.${unavailable}`) : undefined;
              return (
                <button key={item} type="button" onClick={() => setRange(item)} disabled={!!unavailable}
                  aria-pressed={range === item} aria-label={reason ? `${RANGE_LABELS[item]}: ${reason}` : RANGE_LABELS[item]} title={reason}
                  className={`rounded px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${range === item ? 'bg-accent-dim text-white' : 'text-text-dim hover:text-text'}`}>
                  {RANGE_LABELS[item]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="relative h-[380px] w-full">
        {hovered && displayMeta && !loading && (
          <div data-testid="kline-tooltip" className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-border bg-bg-elevated px-3 py-2 text-[11px] shadow-lg">
            <div className="mb-1 font-semibold text-text">
              {formatChartTime(hovered.time, displayMeta.interval, locale)} · {displayMeta.timezone}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums sm:grid-cols-4">
              <span>{t('tooltip.open')} {priceFormatter.format(hovered.open)}</span>
              <span>{t('tooltip.high')} {priceFormatter.format(hovered.high)}</span>
              <span>{t('tooltip.low')} {priceFormatter.format(hovered.low)}</span>
              <span>{t('tooltip.close')} {priceFormatter.format(hovered.close)}</span>
              <span className={hovered.changePct == null ? 'text-text-dim' : hovered.changePct >= 0 ? 'text-up' : 'text-down'}>
                {t('tooltip.change')} {hovered.change == null || hovered.changePct == null
                  ? '—'
                  : `${hovered.change > 0 ? '+' : ''}${priceFormatter.format(hovered.change)} (${hovered.changePct > 0 ? '+' : ''}${hovered.changePct.toFixed(2)}%)`}
              </span>
              <span>{t('tooltip.volume')} {volumeFormatter.format(hovered.volume)} {t(`volumeUnits.${volumeUnit}`)}</span>
              {currency && <span>{t('tooltip.currency')} {currency}</span>}
            </div>
          </div>
        )}
        {loading && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md bg-bg-card text-sm text-text-dim" aria-live="polite">{t('loading')}</div>}
        {!loading && (unsupportedReason || bars.length === 0) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-md bg-bg-card px-6 text-center text-sm text-text-dim" role="status">
            <span>{unsupportedReason ? t(`errors.${unsupportedReason}`) : errorMessage}</span>
            {!unsupportedReason && (
              <button type="button" onClick={refetch} className="rounded border border-border px-3 py-1.5 text-xs text-text hover:border-accent">
                {t('retry')}
              </button>
            )}
          </div>
        )}
        <div ref={containerRef} className="h-[380px] w-full rounded-md bg-bg-card" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted" aria-live="polite">
        {displayMeta ? <>
          <span>{t(sourceTranslationKey(displayMeta))}</span>
          <span>{t('granularity', { value: t(`granularityNames.${displayMeta.granularity}`) })}</span>
          <span>{currency && t('currency', { value: currency })}</span>
          <span>{t('volumeUnit', { value: t(`volumeUnits.${volumeUnit}`) })}</span>
          <span>{t(`adjustments.${displayMeta.adjustment}`)}</span>
          <span>{t('coverage', { start: displayMeta.coverageStart, end: displayMeta.coverageEnd })}</span>
          <span>{t('barCoverage', { returned: displayMeta.returnedBars, requested: displayMeta.requestedBars })}</span>
          <span>{t('asOf', { value: displayMeta.asOf, timezone: displayMeta.timezone })}</span>
          <span>{t('fetchedAt', { value: formatFetchedAt(displayMeta.fetchedAt, displayMeta.timezone, locale) })}</span>
          {chartStatusKeys(displayMeta).map((key) => (
            <span key={key}>{key === 'freshness.stale'
              ? t(key, { seconds: displayMeta.cacheAgeSeconds ?? displayMeta.staleAgeSeconds ?? 0 })
              : t(key)}</span>
          ))}
          <span>{t(`indicators.${
            displayMeta.interval === 'minute' ? 'intraday'
            : displayMeta.interval === 'day' ? 'daily'
            : displayMeta.interval === 'week' ? 'weekly'
            : 'monthly'
          }`)}</span>
        </> : loading ? <span>{t('loading')}</span> : null}
      </div>
    </div>
  );
}
