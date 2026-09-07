'use client';

import { PanelRightOpen } from 'lucide-react';
import { useCallback, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { useVirtualRows } from '@/lib/hooks/useVirtualRows';
import type { WatchlistMarketRow } from '@/lib/watchlist/market-row';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import { watchlistColumnRequiresSingleMarket } from '@/lib/watchlist/overview-query';
import type { WatchlistQuickViewTab } from '@/lib/watchlist/quick-view';
import type { WatchlistColumnKey, WatchlistTablePreferences } from '@/lib/watchlist/ui-preferences';
import {
  WATCHLIST_ANALYTICS_COLUMNS,
  WATCHLIST_DEFAULT_COLUMN_WIDTHS,
  WATCHLIST_NUMERIC_COLUMNS,
} from './WatchlistTableConfig';
import { WatchlistMetricHeader } from './WatchlistMetricHeader';
import { WatchlistTableCell } from './WatchlistTableCell';

export function WatchlistDesktopTable({
  rows,
  overviewByTicker,
  preferences,
  setPreferences,
  selected,
  setSelected,
  overviewHasMore,
  overviewLoadingMore,
  overviewQueryActive,
  onLoadMoreOverview,
  onSelectTicker,
}: {
  rows: WatchlistMarketRow[];
  overviewByTicker: Record<string, WatchlistOverviewRow>;
  preferences: WatchlistTablePreferences;
  setPreferences: Dispatch<SetStateAction<WatchlistTablePreferences>>;
  selected: ReadonlySet<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  overviewHasMore: boolean;
  overviewLoadingMore: boolean;
  overviewQueryActive: boolean;
  onLoadMoreOverview?: () => Promise<void>;
  onSelectTicker?: (ticker: string, tab?: WatchlistQuickViewTab) => void;
}) {
  const t = useTranslations('market.table');
  const { sortKey, asc, visibleColumns, marketFilter, density, pinnedColumns } = preferences;
  const [draftWidths, setDraftWidths] = useState<Partial<Record<WatchlistColumnKey, number>>>({});
  const rowHeight = density === 'compact' ? 44 : 52;
  const virtualRows = useVirtualRows({
    count: rows.length,
    rowHeight,
    enabled: rows.length > 80,
    resetKey: `${sortKey}:${asc}:${rows.map((row) => row.ticker).join(',')}:${density}`,
  });
  const handleScroll = useCallback(() => {
    virtualRows.onScroll();
    const element = virtualRows.containerRef.current;
    if (!element || !overviewHasMore || overviewLoadingMore || !onLoadMoreOverview) return;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= rowHeight * 8) void onLoadMoreOverview();
  }, [onLoadMoreOverview, overviewHasMore, overviewLoadingMore, rowHeight, virtualRows]);
  const visibleRows = rows.slice(virtualRows.start, virtualRows.end);
  const tableColumnCount = visibleColumns.length + 1 + (onSelectTicker ? 1 : 0);
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selected.has(row.ticker));
  const columnWidth = useCallback((column: WatchlistColumnKey) => (
    draftWidths[column]
      ?? preferences.columnWidths[column]
      ?? WATCHLIST_DEFAULT_COLUMN_WIDTHS[column]
      ?? 104
  ), [draftWidths, preferences.columnWidths]);
  const pinnedVisibleColumns = visibleColumns.filter((column) => pinnedColumns.includes(column));
  const stickyLeft = (column: WatchlistColumnKey) => {
    const index = pinnedVisibleColumns.indexOf(column);
    if (index < 0) return undefined;
    return 40 + pinnedVisibleColumns.slice(0, index).reduce((sum, item) => sum + columnWidth(item), 0);
  };
  const startResize = (column: WatchlistColumnKey, event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidth(column);
    let nextWidth = startWidth;
    const move = (moveEvent: PointerEvent) => {
      nextWidth = Math.min(480, Math.max(72, startWidth + moveEvent.clientX - startX));
      setDraftWidths((current) => ({ ...current, [column]: nextWidth }));
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      setPreferences((current) => ({
        ...current,
        columnWidths: { ...current.columnWidths, [column]: Math.round(nextWidth) },
      }));
      setDraftWidths((current) => {
        const next = { ...current };
        delete next[column];
        return next;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };
  const adjustColumnWidth = (column: WatchlistColumnKey, delta: number) => setPreferences((current) => ({
    ...current,
    columnWidths: {
      ...current.columnWidths,
      [column]: Math.min(480, Math.max(72, columnWidth(column) + delta)),
    },
  }));
  const sort = (key: WatchlistColumnKey) => {
    if (overviewHasMore && WATCHLIST_ANALYTICS_COLUMNS.has(key) && !overviewQueryActive) return;
    if (marketFilter === 'all' && watchlistColumnRequiresSingleMarket(key)) return;
    setPreferences((current) => current.sortKey === key
      ? { ...current, asc: !current.asc }
      : { ...current, sortKey: key, asc: key === 'ticker' || key === 'name' || key === 'group' });
  };

  return (
    <div ref={virtualRows.containerRef} onScroll={handleScroll} className="hidden max-h-[calc(100dvh-18rem)] min-h-0 overflow-auto sm:block">
      <table aria-label={t('ariaLabel')} aria-rowcount={rows.length + 1} className="w-full min-w-max text-sm">
        <caption className="sr-only">{t('caption')}</caption>
        <thead>
          <tr className="border-b border-border bg-bg-elevated/95 text-[11px] text-text-dim">
            <th className="sticky left-0 top-0 z-30 w-10 bg-bg-elevated px-2 py-2.5">
              <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((current) => {
                const next = new Set(current);
                if (allVisibleSelected) rows.forEach((row) => next.delete(row.ticker));
                else rows.forEach((row) => next.add(row.ticker));
                return next;
              })} aria-label={t('selection.all')} />
            </th>
            {visibleColumns.map((column) => (
              <th key={column} style={{ width: columnWidth(column), minWidth: columnWidth(column), ...(stickyLeft(column) != null ? { left: stickyLeft(column) } : {}) }} className={`group/header sticky top-0 whitespace-nowrap bg-bg-elevated px-3 py-2.5 font-semibold ${stickyLeft(column) != null ? 'z-20' : 'z-10'} ${WATCHLIST_NUMERIC_COLUMNS.has(column) ? 'text-right' : 'text-left'}`} aria-sort={sortKey === column ? (asc ? 'ascending' : 'descending') : 'none'}>
                <WatchlistMetricHeader column={column} active={sortKey === column} ascending={asc} disabled={(overviewHasMore && WATCHLIST_ANALYTICS_COLUMNS.has(column) && !overviewQueryActive) || (marketFilter === 'all' && watchlistColumnRequiresSingleMarket(column))} disabledReason={marketFilter === 'all' && watchlistColumnRequiresSingleMarket(column) ? t('filters.singleMarketSort') : undefined} onSort={() => sort(column)} />
                <span role="separator" tabIndex={0} aria-orientation="vertical" aria-valuemin={72} aria-valuemax={480} aria-valuenow={columnWidth(column)} aria-label={t('columns.resize', { label: t(`headers.${column}`) })} onPointerDown={(event) => startResize(column, event)} onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  adjustColumnWidth(column, (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 24 : 8));
                }} className="absolute inset-y-1 right-0 w-1 cursor-col-resize touch-none rounded bg-transparent hover:bg-accent/60 focus-visible:w-1.5 focus-visible:bg-accent group-hover/header:bg-border-active" />
              </th>
            ))}
            {onSelectTicker && <th className="sticky right-0 top-0 z-30 hidden w-16 bg-bg-elevated px-3 py-2.5 text-right font-semibold shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.9)] xl:table-cell">{t('quickView')}</th>}
          </tr>
        </thead>
        <tbody>
          {virtualRows.paddingTop > 0 && <tr aria-hidden="true"><td colSpan={tableColumnCount} style={{ height: virtualRows.paddingTop, padding: 0 }} /></tr>}
          {visibleRows.map((row, index) => (
            <tr key={row.ticker} data-watchlist-row aria-rowindex={virtualRows.start + index + 2} tabIndex={onSelectTicker ? 0 : undefined} style={{ height: rowHeight }} onClick={() => onSelectTicker?.(row.ticker)} onKeyDown={(event) => {
              if (event.key === 'Enter') onSelectTicker?.(row.ticker);
              if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const siblings = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[data-watchlist-row]') ?? [])];
              const current = siblings.indexOf(event.currentTarget);
              const target = event.key === 'Home' ? 0 : event.key === 'End' ? siblings.length - 1 : current + (event.key === 'ArrowDown' ? 1 : -1);
              siblings[Math.min(siblings.length - 1, Math.max(0, target))]?.focus();
            }} className={`group border-b border-border/40 last:border-0 hover:bg-bg-hover hover:shadow-[inset_2px_0_0_var(--accent)] ${onSelectTicker ? 'cursor-pointer focus:bg-bg-hover focus:outline-none focus:shadow-[inset_2px_0_0_var(--accent)]' : ''}`}>
              <td className="sticky left-0 z-10 w-10 bg-bg-card px-2 text-center group-hover:bg-bg-hover"><input type="checkbox" checked={selected.has(row.ticker)} onClick={(event) => event.stopPropagation()} onChange={() => setSelected((current) => {
                const next = new Set(current);
                if (next.has(row.ticker)) next.delete(row.ticker); else next.add(row.ticker);
                return next;
              })} aria-label={t('selection.toggle', { ticker: row.ticker })} /></td>
              {visibleColumns.map((column) => <td key={column} style={{ width: columnWidth(column), minWidth: columnWidth(column), maxWidth: columnWidth(column), ...(stickyLeft(column) != null ? { left: stickyLeft(column) } : {}) }} className={`whitespace-nowrap overflow-hidden px-3 ${density === 'compact' ? 'py-1' : 'py-2'} transition-colors ${stickyLeft(column) != null ? 'sticky z-[5] bg-bg-card group-hover:bg-bg-hover' : ''} ${WATCHLIST_NUMERIC_COLUMNS.has(column) ? 'text-right tabular-nums' : ''}`}><WatchlistTableCell row={row} column={column} overview={overviewByTicker[row.ticker]} queryActive={overviewQueryActive} onSelectTicker={onSelectTicker} /></td>)}
              {onSelectTicker && <td className="sticky right-0 z-10 hidden bg-bg-card px-3 py-3 text-right shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.9)] group-hover:bg-bg-hover xl:table-cell"><button type="button" onClick={(event) => { event.stopPropagation(); onSelectTicker(row.ticker); }} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" title={t('quickViewAction')} aria-label={t('quickViewAction')}><PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" /></button></td>}
            </tr>
          ))}
          {virtualRows.paddingBottom > 0 && <tr aria-hidden="true"><td colSpan={tableColumnCount} style={{ height: virtualRows.paddingBottom, padding: 0 }} /></tr>}
        </tbody>
      </table>
    </div>
  );
}
