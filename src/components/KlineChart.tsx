'use client';

import { useEffect, useRef } from 'react';

interface Props {
  ticker: string;
  basePrice: number;
}

interface OHLCV {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function generateMockKline(startPrice: number, days = 120, volatility = 0.022, trend = 0.15): OHLCV[] {
  const out: OHLCV[] = [];
  let price = startPrice * 0.85;
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  for (let i = days; i >= 0; i--) {
    const ts = now - i * day;
    const date = new Date(ts * 1000);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const change = (Math.random() - 0.5 + trend / 100) * volatility;
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const volume = Math.floor(1e6 + Math.random() * 5e6);
    out.push({ time: date.toISOString().slice(0, 10), open, high, low, close, volume });
    price = close;
  }
  return out;
}

function computeMA(data: OHLCV[], period: number): Array<{ time: string; value: number }> {
  const out: Array<{ time: string; value: number }> = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

export function KlineChart({ ticker, basePrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: any;
    let resize: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      // Dynamic import to keep this client-only (lightweight-charts is browser-only)
      const lwc = await import('lightweight-charts');
      if (cancelled || !containerRef.current) return;

      const container = containerRef.current;
      container.innerHTML = '';

      // Get color scheme to align candle colors with user prefs
      const scheme = document.documentElement.getAttribute('data-color-scheme') || 'cn';
      const upColor = scheme === 'cn' ? '#ef4444' : '#10b981';
      const downColor = scheme === 'cn' ? '#10b981' : '#ef4444';

      chart = lwc.createChart(container, {
        width: container.clientWidth,
        height: 380,
        layout: {
          background: { color: 'transparent' },
          textColor: '#e6edf3',
          fontFamily: 'system-ui',
        },
        grid: {
          vertLines: { color: '#30363d' },
          horzLines: { color: '#30363d' },
        },
        timeScale: { borderColor: '#30363d' },
        rightPriceScale: { borderColor: '#30363d' },
        crosshair: { mode: lwc.CrosshairMode.Normal },
      });

      const candleData = generateMockKline(basePrice);

      const candleSeries = chart.addCandlestickSeries({
        upColor, downColor,
        borderUpColor: upColor, borderDownColor: downColor,
        wickUpColor: upColor, wickDownColor: downColor,
      });
      candleSeries.setData(candleData);

      const ma5 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'MA5' });
      ma5.setData(computeMA(candleData, 5));
      const ma20 = chart.addLineSeries({ color: '#58a6ff', lineWidth: 1, title: 'MA20' });
      ma20.setData(computeMA(candleData, 20));

      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volSeries.setData(
        candleData.map((d) => ({
          time: d.time,
          value: d.volume,
          color: d.close >= d.open ? upColor + '80' : downColor + '80',
        }))
      );

      chart.timeScale().fitContent();

      resize = () => {
        if (container) chart.applyOptions({ width: container.clientWidth });
      };
      window.addEventListener('resize', resize);
    })();

    return () => {
      cancelled = true;
      if (resize) window.removeEventListener('resize', resize);
      if (chart) chart.remove();
    };
  }, [ticker, basePrice]);

  return (
    <div>
      <div ref={containerRef} className="h-[380px] w-full rounded-md bg-bg-card" />
      <div className="mt-2 text-right text-[11px] text-text-muted">
        数据为前端模拟生成（demo 用）；生产版本接 Alpha Vantage / Akshare
      </div>
    </div>
  );
}
