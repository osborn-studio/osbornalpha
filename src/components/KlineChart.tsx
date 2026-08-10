'use client';

import { useEffect, useRef, useState } from 'react';
import { useKline } from '@/lib/hooks/useQuote';

interface OHLCV {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const RANGES = [
  { id: '1d', label: '1D', interval: '1' as const, limit: 240 },
  { id: '1m', label: '1M', interval: 'D' as const, limit: 22 },
  { id: '3m', label: '3M', interval: 'D' as const, limit: 66 },
  { id: '1y', label: '1Y', interval: 'D' as const, limit: 260 },
] as const;

type RangeId = typeof RANGES[number]['id'];

function computeMA(data: OHLCV[], period: number): Array<{ time: string; value: number }> {
  const out: Array<{ time: string; value: number }> = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

function chartTime(time: string): string | number {
  if (!time.includes(' ')) return time;
  const timestamp = Date.parse(time.replace(' ', 'T'));
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : time.slice(0, 10);
}

export function KlineChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rangeId, setRangeId] = useState<RangeId>('3m');
  const range = RANGES.find((item) => item.id === rangeId) ?? RANGES[2];
  const { bars, loading, source, error } = useKline(ticker, range.interval, range.limit);
  const barLabel = range.interval === '1' && source !== 'twse' ? '分钟线' : '日线';

  useEffect(() => {
    let chart: any;
    let resize: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      if (!containerRef.current) return;
      const lwc = await import('lightweight-charts');
      if (cancelled || !containerRef.current) return;
      const container = containerRef.current;
      container.innerHTML = '';
      if (bars.length === 0) return;

      const scheme = document.documentElement.getAttribute('data-color-scheme') || 'cn';
      const upColor = scheme === 'cn' ? '#ef4444' : '#10b981';
      const downColor = scheme === 'cn' ? '#10b981' : '#ef4444';
      const data: OHLCV[] = bars;

      chart = lwc.createChart(container, {
        width: container.clientWidth,
        height: 380,
        layout: { background: { color: 'transparent' }, textColor: '#e6edf3', fontFamily: 'system-ui' },
        grid: { vertLines: { color: '#30363d' }, horzLines: { color: '#30363d' } },
        timeScale: { borderColor: '#30363d' },
        rightPriceScale: { borderColor: '#30363d' },
        crosshair: { mode: lwc.CrosshairMode.Normal },
      });

      const candleSeries = chart.addCandlestickSeries({ upColor, downColor, borderUpColor: upColor, borderDownColor: downColor, wickUpColor: upColor, wickDownColor: downColor });
      candleSeries.setData(data.map(({ time, open, high, low, close }) => ({ time: chartTime(time), open, high, low, close })));

      const ma5 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'MA5' });
      ma5.setData(computeMA(data, 5).map((point) => ({ ...point, time: chartTime(point.time) })));
      const ma20 = chart.addLineSeries({ color: '#58a6ff', lineWidth: 1, title: 'MA20' });
      ma20.setData(computeMA(data, 20).map((point) => ({ ...point, time: chartTime(point.time) })));

      const volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volSeries.setData(data.map((d) => ({ time: chartTime(d.time), value: d.volume, color: d.close >= d.open ? `${upColor}80` : `${downColor}80` })));
      chart.timeScale().fitContent();

      resize = () => chart?.applyOptions({ width: container.clientWidth });
      window.addEventListener('resize', resize);
    })();

    return () => {
      cancelled = true;
      if (resize) window.removeEventListener('resize', resize);
      if (chart) chart.remove();
    };
  }, [ticker, bars]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-text-muted">走势区间</div>
        <div className="inline-flex rounded-md bg-bg-card p-0.5" role="group" aria-label="走势图周期">
          {RANGES.map((item) => (
            <button key={item.id} type="button" onClick={() => setRangeId(item.id)} aria-pressed={rangeId === item.id}
              className={`rounded px-2 py-1 text-xs font-medium transition ${rangeId === item.id ? 'bg-accent-dim text-white' : 'text-text-dim hover:text-text'}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-[380px] w-full">
        {loading && bars.length === 0 && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-bg-card text-sm text-text-dim" aria-live="polite">正在加载行情…</div>}
        {!loading && bars.length === 0 && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-bg-card px-6 text-center text-sm text-text-dim" role="status">{error ? `行情加载失败：${error}` : '该周期暂无可用行情数据'}</div>}
        <div ref={containerRef} className="h-[380px] w-full rounded-md bg-bg-card" />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
        <span>{error ? `加载失败：${error}` : source === 'eastmoney' ? '真实数据（东方财富）' : source === 'twse' ? '真实数据（台湾证券交易所）' : '等待行情数据'}</span>
        <span>{bars.length > 0 ? `${bars.length} 根${barLabel}` : ''}</span>
      </div>
    </div>
  );
}
