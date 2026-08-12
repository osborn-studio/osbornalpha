'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import { KLINE_RANGES, klineRangeAvailability, type KlineRange } from '@/lib/chart/kline';
import { useKline } from '@/lib/hooks/useQuote';
import { chartStatusKeys, sourceTranslationKey } from './kline-chart-meta';

const RANGE_LABELS: Record<KlineRange, string> = { '1d': '1D', '1m': '1M', '3m': '3M', '1y': '1Y' };

function computeMA(data: Array<{ time: number; close: number }>, period: number) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    out.push({ time: data[i].time as UTCTimestamp, value: sum / period });
  }
  return out;
}

export function KlineChart({ ticker }: { ticker: string }) {
  const t = useTranslations('market.stock.chart');
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<KlineRange>('3m');
  const { bars, loading, error, errorCode, meta } = useKline(ticker, range);
  const unsupportedReason = klineRangeAvailability(ticker, range);

  useEffect(() => {
    let chart: IChartApi | null = null;
    let observer: ResizeObserver | null = null;
    let cancelled = false;

    (async () => {
      const container = containerRef.current;
      if (!container || bars.length === 0) return;
      const lwc = await import('lightweight-charts');
      if (cancelled || !containerRef.current) return;
      container.innerHTML = '';

      const scheme = document.documentElement.getAttribute('data-color-scheme') || 'cn';
      const upColor = scheme === 'cn' ? '#ef4444' : '#10b981';
      const downColor = scheme === 'cn' ? '#10b981' : '#ef4444';
      chart = lwc.createChart(container, {
        width: Math.max(container.clientWidth, 1),
        height: 380,
        layout: { background: { color: 'transparent' }, textColor: '#e6edf3', fontFamily: 'system-ui' },
        grid: { vertLines: { color: '#30363d' }, horzLines: { color: '#30363d' } },
        timeScale: { borderColor: '#30363d' },
        rightPriceScale: { borderColor: '#30363d' },
        crosshair: { mode: lwc.CrosshairMode.Normal },
      });

      const candles = chart.addCandlestickSeries({ upColor, downColor, borderUpColor: upColor, borderDownColor: downColor, wickUpColor: upColor, wickDownColor: downColor });
      candles.setData(bars.map(({ time, open, high, low, close }) => ({ time: time as UTCTimestamp, open, high, low, close })));

      if (meta?.interval === 'day') {
        const ma5 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'MA5' });
        ma5.setData(computeMA(bars, 5));
        const ma20 = chart.addLineSeries({ color: '#58a6ff', lineWidth: 1, title: 'MA20' });
        ma20.setData(computeMA(bars, 20));
      }

      const volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volume.setData(bars.map((bar) => ({ time: bar.time as UTCTimestamp, value: bar.volume, color: bar.close >= bar.open ? `${upColor}80` : `${downColor}80` })));
      chart.timeScale().fitContent();

      observer = new ResizeObserver(([entry]) => {
        const width = Math.floor(entry.contentRect.width);
        if (width > 0) chart?.applyOptions({ width });
      });
      observer.observe(container);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      chart?.remove();
    };
  }, [bars, meta?.interval]);

  const errorMessage = errorCode && [
    'market_unsupported',
    'intraday_unsupported',
    'history_unsupported',
    'provider_unavailable',
    'invalid_data',
  ].includes(errorCode)
    ? t(`errors.${errorCode}`)
    : error ? t('errors.loadFailed') : t('errors.noData');

  return (
    <div data-testid="kline-chart">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-text-muted">{t('rangeLabel')}</div>
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
      <div className="relative h-[380px] w-full">
        {loading && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-bg-card text-sm text-text-dim" aria-live="polite">{t('loading')}</div>}
        {!loading && (unsupportedReason || bars.length === 0) && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-bg-card px-6 text-center text-sm text-text-dim" role="status">{unsupportedReason ? t(`errors.${unsupportedReason}`) : errorMessage}</div>}
        <div ref={containerRef} className="h-[380px] w-full rounded-md bg-bg-card" />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-text-muted" aria-live="polite">
        {meta ? <>
          <span>{t(sourceTranslationKey(meta))}</span>
          <span>{t('granularity', { value: meta.granularity })}</span>
          <span>{t(`adjustments.${meta.adjustment}`)}</span>
          <span>{t('coverage', { start: meta.coverageStart, end: meta.coverageEnd })}</span>
          <span>{t('asOf', { value: meta.asOf, timezone: meta.timezone })}</span>
          <span>{t('fetchedAt', { value: meta.fetchedAt })}</span>
          {chartStatusKeys(meta).map((key) => (
            <span key={key}>{key === 'freshness.stale'
              ? t(key, { seconds: meta.staleAgeSeconds ?? 0 })
              : t(key)}</span>
          ))}
          <span>{meta.interval === 'day' ? t('indicators.daily') : t('indicators.intraday')}</span>
        </> : <span>{loading ? t('loading') : errorMessage}</span>}
      </div>
    </div>
  );
}
