'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { CreatePriceLineOptions, IChartApi, IPriceLine, UTCTimestamp } from 'lightweight-charts';
import {
  KLINE_RANGES,
  klineRangeAvailability,
  type KlineBar,
  type KlineMeta,
  type KlineRange,
} from '@/lib/chart/kline';
import { useKline } from '@/lib/hooks/useQuote';
import { chartStatusKeys, sourceTranslationKey } from './kline-chart-meta';
import { computeSessionVwap } from '@/lib/chart/session-vwap';
import { usePersistentState } from '@/lib/hooks/usePersistentState';

const RANGE_LABELS: Record<KlineRange, string> = { '1d': '1D', '5d': '5D', '1m': '1M', '6m': '6M', ytd: 'YTD', '1y': '1Y', '5y': '5Y', all: 'All' };
const CHART_TYPES = ['line', 'candle', 'baseline', 'area', 'bar'] as const;
type ChartType = typeof CHART_TYPES[number];

interface ChartPreferences {
  range: KlineRange;
  chartType: ChartType;
  showTooltip: boolean;
  showVolume: boolean;
  showIndicators: boolean;
  showPreviousClose: boolean;
}

const DEFAULT_CHART_PREFERENCES: ChartPreferences = {
  range: '1d',
  chartType: 'candle',
  showTooltip: true,
  showVolume: true,
  showIndicators: true,
  showPreviousClose: true,
};

function validChartPreferences(value: unknown): value is ChartPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<ChartPreferences>;
  return typeof item.range === 'string' && (KLINE_RANGES as readonly string[]).includes(item.range)
    && typeof item.chartType === 'string' && (CHART_TYPES as readonly string[]).includes(item.chartType)
    && typeof item.showTooltip === 'boolean'
    && typeof item.showVolume === 'boolean'
    && typeof item.showIndicators === 'boolean'
    && typeof item.showPreviousClose === 'boolean';
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visualRevision, setVisualRevision] = useState(0);
  const [hovered, setHovered] = useState<HoverSnapshot | null>(null);
  // Crosshair anchor (chart-pane pixels) so the tooltip follows the cursor
  // like a trading terminal instead of sitting in the corner.
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const [preferences, setPreferences] = usePersistentState(
    `stock-monitor:chart-preferences-v1:${ticker}`,
    DEFAULT_CHART_PREFERENCES,
    validChartPreferences,
  );
  const { range, chartType, showTooltip, showVolume, showIndicators, showPreviousClose } = preferences;
  const { bars, loading, error, errorCode, meta, refetch } = useKline(ticker, range);
  const displayMeta = meta;
  const unsupportedReason = klineRangeAvailability(ticker, range);

  const selectChartType = (next: ChartType) => {
    setPreferences((current) => ({ ...current, chartType: next }));
  };

  const setPreference = <K extends keyof ChartPreferences>(key: K, value: ChartPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

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

      const ohlcData = bars.map(({ time, open, high, low, close }) => ({
        time: time as UTCTimestamp,
        open,
        high,
        low,
        close,
      }));
      const lineData = bars.map(({ time, close }) => ({ time: time as UTCTimestamp, value: close }));
      const priceFormat = { type: 'price' as const, precision, minMove };
      const addPreviousCloseLine = (series: { createPriceLine(options: CreatePriceLineOptions): IPriceLine }) => {
        if (range !== '1d' || !showPreviousClose || bars[0]?.previousClose == null) return;
        series.createPriceLine({
          price: bars[0].previousClose,
          color: cssVariable('--text-muted', '#a1a1aa'),
          lineWidth: 1,
          lineStyle: lwc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: t('prevClose'),
        });
      };

      if (chartType === 'line') {
        const series = chart.addLineSeries({ color: upColor, lineWidth: 2, priceFormat });
        series.setData(lineData);
        addPreviousCloseLine(series);
      } else if (chartType === 'baseline') {
        const basePrice = bars[0]?.previousClose ?? bars[0]?.close;
        const series = chart.addBaselineSeries({
          baseValue: { type: 'price', price: basePrice },
          topLineColor: upColor,
          topFillColor1: `${upColor}30`,
          topFillColor2: `${upColor}08`,
          bottomLineColor: downColor,
          bottomFillColor1: `${downColor}08`,
          bottomFillColor2: `${downColor}30`,
          priceFormat,
        });
        series.setData(lineData);
        addPreviousCloseLine(series);
      } else if (chartType === 'area') {
        const series = chart.addAreaSeries({
          lineColor: upColor,
          topColor: `${upColor}38`,
          bottomColor: `${upColor}05`,
          lineWidth: 2,
          priceFormat,
        });
        series.setData(lineData);
        addPreviousCloseLine(series);
      } else if (chartType === 'bar') {
        const series = chart.addBarSeries({ upColor, downColor, thinBars: true, priceFormat });
        series.setData(ohlcData);
        addPreviousCloseLine(series);
      } else {
        const series = chart.addCandlestickSeries({
          upColor,
          downColor,
          borderUpColor: upColor,
          borderDownColor: downColor,
          wickUpColor: upColor,
          wickDownColor: downColor,
          priceFormat,
        });
        series.setData(ohlcData);
        addPreviousCloseLine(series);
      }

      // Intraday benchmark: the audited previous-session close grounds the
      // day's strength at a glance (standard time-share chart convention).
      if (showIndicators && displayMeta.interval !== 'minute') {
        const warmup = displayMeta.maWarmupCloses ?? [];
        const ma5 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'MA5', priceFormat: { type: 'price', precision, minMove } });
        ma5.setData(computeMA(bars, 5, warmup));
        const ma20 = chart.addLineSeries({ color: '#58a6ff', lineWidth: 1, title: 'MA20', priceFormat: { type: 'price', precision, minMove } });
        ma20.setData(computeMA(bars, 20, warmup));
      } else if (showIndicators) {
        const vwapData = computeSessionVwap(bars);
        if (vwapData.some((bar) => 'value' in bar)) {
          const vwap = chart.addLineSeries({ color: '#facc15', lineWidth: 1, title: t('avgPrice'), priceFormat: { type: 'price', precision, minMove } });
          vwap.setData(vwapData);
        }
      }

      if (showVolume) {
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
      }

      const indexByTime = new Map(bars.map((bar, index) => [bar.time, index]));
      setHovered(hoverSnapshot(bars, bars.length - 1));
      chart.subscribeCrosshairMove((param) => {
        if (typeof param.time !== 'number') {
          setHovered(hoverSnapshot(bars, bars.length - 1));
          setHoverPoint(null);
          return;
        }
        const index = indexByTime.get(param.time);
        if (index !== undefined) setHovered(hoverSnapshot(bars, index));
        if (param.point) setHoverPoint({ x: param.point.x, y: param.point.y });
        else setHoverPoint(null);
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
  }, [bars, chartType, displayMeta, locale, range, showIndicators, showPreviousClose, showVolume, t, visualRevision]);

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
  // Keep the tooltip inside the chart pane as it follows the crosshair;
  // fall back to the top-left corner when the cursor is outside.
  const tooltipPosition = useMemo(() => {
    if (!hoverPoint || !containerRef.current) return { left: 8, top: 8 };
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    return {
      left: Math.max(8, Math.min(hoverPoint.x + 16, width - 330)),
      top: Math.max(8, Math.min(hoverPoint.y - 8, height - 150)),
    };
  }, [hoverPoint]);

  return (
    <div data-testid="kline-chart">
      <div className="mb-3 flex flex-col gap-2 border-b border-border pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor={`chart-type-${ticker}`}>{t('chartType')}</label>
          <select id={`chart-type-${ticker}`} value={chartType} onChange={(event) => selectChartType(event.target.value as ChartType)} className="border-border bg-bg-elevated px-2.5 py-1.5 text-xs font-medium" aria-label={t('chartType')}>
            {CHART_TYPES.map((type) => <option key={type} value={type}>{t(`chartTypes.${type}`)}</option>)}
          </select>
          <div className="relative">
            <button type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} className="rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-xs text-text-dim transition hover:border-border-active hover:text-text">
              {t('settings')}
            </button>
            {settingsOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-48 rounded-md border border-border bg-bg-elevated p-2 shadow-xl">
                {[
                  ['tooltip', showTooltip, (value: boolean) => setPreference('showTooltip', value)],
                  ['volume', showVolume, (value: boolean) => setPreference('showVolume', value)],
                  ['indicators', showIndicators, (value: boolean) => setPreference('showIndicators', value)],
                  ['previousClose', showPreviousClose, (value: boolean) => setPreference('showPreviousClose', value)],
                ].map(([key, checked, setter]) => (
                  <label key={String(key)} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-bg-card">
                    <input type="checkbox" checked={checked as boolean} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} />
                    <span>{t(`settingsOptions.${key}`)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            disabled={bars.length === 0}
            className="rounded-md px-2.5 py-1.5 text-xs text-text-dim transition hover:bg-bg-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('resetView')}
          </button>
        </div>
        <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-0.5 lg:pb-0">
          <span className="shrink-0 text-xs text-text-muted">{t('rangeLabel')}</span>
          <div className="inline-flex shrink-0 rounded-md border border-border bg-bg-elevated p-0.5" role="group" aria-label={t('rangeAriaLabel')}>
            {KLINE_RANGES.map((item) => {
              const unavailable = klineRangeAvailability(ticker, item);
              const reason = unavailable ? t(`errors.${unavailable}`) : undefined;
              return (
                <button key={item} type="button" onClick={() => setPreference('range', item)} disabled={!!unavailable}
                  aria-pressed={range === item} aria-label={reason ? `${RANGE_LABELS[item]}: ${reason}` : RANGE_LABELS[item]} title={reason}
                  className={`rounded px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${range === item ? 'bg-accent-dim text-white' : 'text-text-dim hover:text-text'}`}>
                  {RANGE_LABELS[item]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="relative h-[380px] w-full overflow-hidden rounded-md border border-border bg-bg-card">
        {showTooltip && hovered && displayMeta && !loading && (
          <div data-testid="kline-tooltip" style={tooltipPosition} className="pointer-events-none absolute z-10 max-w-[calc(100%-16px)] rounded-md border border-border bg-bg-elevated/95 px-2.5 py-2 text-[10px] shadow-lg backdrop-blur sm:px-3 sm:text-[11px]">
            <div className="mb-1 font-semibold text-text">
              {formatChartTime(hovered.time, displayMeta.interval, locale)} · {displayMeta.timezone}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums sm:grid-cols-4 sm:gap-x-4">
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
        <div ref={containerRef} className="h-[380px] w-full bg-bg-card" />
      </div>
      <div className="mt-2 text-[10px] text-text-muted sm:text-[11px]" aria-live="polite">
        {displayMeta ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-text-dim">{t(sourceTranslationKey(displayMeta))}</span>
              <span>{t('asOf', { value: displayMeta.asOf, timezone: displayMeta.timezone })}</span>
              <span>{displayMeta.delayed ? t('delayed') : t('live')}</span>
            </div>
            <details className="mt-1.5 border-t border-border/60 pt-1.5">
              <summary className="w-fit cursor-pointer select-none text-text-dim transition hover:text-text">{t('dataDetails')}</summary>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                <span>{t('granularity', { value: t(`granularityNames.${displayMeta.granularity}`) })}</span>
                {currency && <span>{t('currency', { value: currency })}</span>}
                <span>{t('volumeUnit', { value: t(`volumeUnits.${volumeUnit}`) })}</span>
                <span>{t(`adjustments.${displayMeta.adjustment}`)}</span>
                <span>{t('coverage', { start: displayMeta.coverageStart, end: displayMeta.coverageEnd })}</span>
                <span>{t('barCoverage', { returned: displayMeta.returnedBars, requested: displayMeta.requestedBars })}</span>
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
              </div>
            </details>
          </>
        ) : loading ? <span>{t('loading')}</span> : null}
      </div>
    </div>
  );
}
