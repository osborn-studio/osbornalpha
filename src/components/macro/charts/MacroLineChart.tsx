'use client';
// MacroLineChart — lightweight-charts 4.2 line with cycle bands (histogram on a hidden scale) and event markers
// (spec §3.3). Up/hiking bands use --warn at low alpha, down/cutting bands use --accent-wash, plateau a faint grey.
// Derived events are arrows above the line; calendar entries are circles below it.
import { useEffect, useRef } from 'react';
import type { IChartApi, SeriesMarker, Time } from 'lightweight-charts';
import { bandPoints, snapMarkers, withAlpha } from './chart-geometry';

export interface LinePoint { time: string; value: number }
export interface ChartBand { start: string; end: string; direction: 'up' | 'down' | 'plateau' }
export interface ChartMarker { time: string; kind: 'derived' | 'calendar'; text: string }

function cssVariable(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function MacroLineChart({ points, bands = [], markers = [], height = 260, ariaLabel }: {
  points: LinePoint[]; bands?: ChartBand[]; markers?: ChartMarker[]; height?: number; ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let chart: IChartApi | null = null;
    let observer: ResizeObserver | null = null;
    let cancelled = false;
    (async () => {
      const el = ref.current;
      if (!el || points.length === 0) return;
      const lwc = await import('lightweight-charts');
      if (cancelled || !ref.current) return;
      el.innerHTML = '';
      const text = cssVariable('--text', '#fafafa');
      const dim = cssVariable('--text-dim', '#a1a1aa');
      const grid = cssVariable('--border', 'rgba(255,255,255,0.06)');
      const warn = cssVariable('--warn', '#eab308');
      const wash = cssVariable('--accent-wash', 'rgba(202,138,4,0.12)');
      const accent = cssVariable('--accent', '#ca8a04');
      chart = lwc.createChart(el, {
        width: Math.max(el.clientWidth, 1),
        height,
        layout: { background: { color: 'transparent' }, textColor: dim, fontFamily: 'system-ui' },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        timeScale: { borderColor: grid },
        rightPriceScale: { borderColor: grid },
        crosshair: { mode: lwc.CrosshairMode.Normal },
      });
      const times = points.map((p) => p.time);
      const shaded = bandPoints(times, bands);
      if (shaded.length > 0) {
        const band = chart.addHistogramSeries({ priceScaleId: 'bands', lastValueVisible: false, priceLineVisible: false });
        band.priceScale().applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
        band.setData(shaded.map((b) => ({
          time: b.time as Time,
          value: 1,
          color: b.direction === 'up' ? withAlpha(warn, 0.14) : b.direction === 'down' ? wash : withAlpha(dim, 0.08),
        })));
      }
      const line = chart.addLineSeries({ color: text, lineWidth: 2, priceLineVisible: false });
      line.setData(points.map((p) => ({ time: p.time as Time, value: p.value })));
      line.setMarkers(snapMarkers(times, markers).map((m): SeriesMarker<Time> => ({
        time: m.time as Time,
        position: m.kind === 'derived' ? 'aboveBar' : 'belowBar',
        shape: m.kind === 'derived' ? 'arrowDown' : 'circle',
        color: m.kind === 'derived' ? accent : dim,
        text: m.text,
      })));
      chart.timeScale().fitContent();
      observer = new ResizeObserver(([entry]) => {
        const width = Math.floor(entry.contentRect.width);
        if (width > 0) chart?.applyOptions({ width });
      });
      observer.observe(el);
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      chart?.remove();
    };
  }, [points, bands, markers, height]);
  return <div ref={ref} role="img" aria-label={ariaLabel} style={{ height }} className="w-full" />;
}
