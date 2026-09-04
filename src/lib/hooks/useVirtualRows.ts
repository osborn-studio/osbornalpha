'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface VirtualRowWindow {
  start: number;
  end: number;
  paddingTop: number;
  paddingBottom: number;
}

export function calculateVirtualRowWindow(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 6,
): VirtualRowWindow {
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0, paddingTop: 0, paddingBottom: 0 };
  const safeScrollTop = Math.max(0, scrollTop);
  const visibleStart = Math.floor(safeScrollTop / rowHeight);
  const visibleCount = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / rowHeight));
  const start = Math.max(0, Math.min(count, visibleStart - overscan));
  const end = Math.max(start, Math.min(count, visibleStart + visibleCount + overscan));
  return {
    start,
    end,
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, (count - end) * rowHeight),
  };
}

export function useVirtualRows({
  count,
  rowHeight,
  enabled,
  resetKey,
  overscan = 6,
}: {
  count: number;
  rowHeight: number;
  enabled: boolean;
  resetKey: string;
  overscan?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateHeight = () => setViewport((current) => ({ ...current, height: element.clientHeight }));
    updateHeight();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateHeight);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [enabled]);

  useEffect(() => {
    const element = containerRef.current;
    if (element) element.scrollTop = 0;
    setViewport((current) => current.scrollTop === 0 ? current : { ...current, scrollTop: 0 });
  }, [resetKey]);

  const window = useMemo(() => enabled
    ? calculateVirtualRowWindow(count, rowHeight, viewport.scrollTop, viewport.height, overscan)
    : { start: 0, end: count, paddingTop: 0, paddingBottom: 0 },
  [count, enabled, overscan, rowHeight, viewport.height, viewport.scrollTop]);

  return {
    containerRef,
    onScroll: () => {
      const element = containerRef.current;
      if (element) setViewport({ scrollTop: element.scrollTop, height: element.clientHeight });
    },
    ...window,
  };
}
