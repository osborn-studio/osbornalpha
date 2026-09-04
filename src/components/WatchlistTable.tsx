'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { formatChange, formatPct, formatPrice, formatVolume, changeClass } from '@/lib/utils';
import type { Market } from '@/lib/supabase/database.types';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import { MarketLabel } from '@/components/MarketLabel';
import {
  buildWatchlistMarketRows,
  type QuoteDisplayStatus,
  type WatchlistMarketGroup,
  type WatchlistSecurityIdentity,
  type WatchlistMarketRow,
} from '@/lib/watchlist/market-row';

type ColumnKey =
  | 'ticker' | 'name' | 'price' | 'change' | 'dayRange' | 'volume' | 'amount'
  | 'marketCap' | 'pe' | 'pb' | 'turnover' | 'volumeRatio' | 'amplitude'
  | 'dayPosition' | 'quality' | 'updated' | 'group';
type PresetKey = 'market' | 'valuation' | 'risk';

const ALL_COLUMNS: ColumnKey[] = [
  'ticker', 'name', 'price', 'change', 'dayRange', 'volume', 'amount', 'marketCap',
  'pe', 'pb', 'turnover', 'volumeRatio', 'amplitude', 'dayPosition', 'quality', 'updated', 'group',
];

const PRESET_COLUMNS: Record<PresetKey, ColumnKey[]> = {
  market: ['ticker', 'name', 'price', 'change', 'dayRange', 'volume', 'amount', 'volumeRatio', 'updated', 'group'],
  valuation: ['ticker', 'name', 'price', 'change', 'marketCap', 'pe', 'pb', 'turnover', 'updated', 'group'],
  risk: ['ticker', 'name', 'price', 'change', 'amplitude', 'dayPosition', 'volumeRatio', 'turnover', 'quality', 'updated', 'group'],
};

const NUMERIC_COLUMNS = new Set<ColumnKey>([
  'price', 'change', 'volume', 'amount', 'marketCap', 'pe', 'pb', 'turnover',
  'volumeRatio', 'amplitude', 'dayPosition', 'quality', 'updated',
]);

function optionalNumber(value: number | null | undefined, suffix = '') {
  return value == null || !Number.isFinite(value)
    ? <span className="text-text-muted">--</span>
    : <span className="tabular-nums">{value.toFixed(2)}{suffix}</span>;
}

function dayPosition(quote: LiveQuote | null): number | null {
  if (!quote || quote.high <= quote.low || quote.price <= 0) return null;
  return Math.min(100, Math.max(0, ((quote.price - quote.low) / (quote.high - quote.low)) * 100));
}

function dataQuality(quote: LiveQuote | null): number {
  if (!quote) return 0;
  const values = [quote.price, quote.prev_close, quote.volume, quote.amount, quote.market_cap, quote.pe_ttm, quote.pb, quote.turnover, quote.volume_ratio];
  return Math.round((values.filter((value) => value != null && Number.isFinite(value) && value !== 0).length / values.length) * 100);
}

function QuoteStatus({ row }: { row: WatchlistMarketRow }) {
  const t = useTranslations('market.table');
  const quote = row.quote;
  if (row.status === 'loading') return <span className="text-text-muted">{t('status.loading')}</span>;
  if (row.status === 'unavailable') return <span className="text-down">{t('status.unavailable')}</span>;

  const source = quote?.source || t('status.unknownSource');
  const updated = quote?.updated_at ? new Date(quote.updated_at).toLocaleString() : t('status.unknownTime');
  const delayed = row.status === 'delayed';
  return (
    <div title={`${source} · ${updated}`}>
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${delayed ? 'border-warn/25 bg-warn/10 text-warn' : 'border-up/20 bg-up/10 text-up'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${delayed ? 'bg-warn' : 'bg-up'}`} />
        {delayed ? t('status.delayed') : t('status.live')}
      </div>
      <div className="mt-1 max-w-[118px] truncate text-[9px] text-text-muted">{source}</div>
    </div>
  );
}

function metricValue(row: WatchlistMarketRow, key: ColumnKey): string | number {
  const quote = row.quote;
  switch (key) {
    case 'ticker': return row.ticker;
    case 'name': return row.name;
    case 'price': return quote?.price ?? -1;
    case 'change': return quote?.change_pct ?? -Infinity;
    case 'dayRange': return quote?.high ?? -1;
    case 'volume': return quote?.volume ?? -1;
    case 'amount': return quote?.amount ?? -1;
    case 'marketCap': return quote?.market_cap ?? -1;
    case 'pe': return quote?.pe_ttm ?? -Infinity;
    case 'pb': return quote?.pb ?? -Infinity;
    case 'turnover': return quote?.turnover ?? -Infinity;
    case 'volumeRatio': return quote?.volume_ratio ?? -Infinity;
    case 'amplitude': return quote?.amplitude ?? -Infinity;
    case 'dayPosition': return dayPosition(quote) ?? -1;
    case 'quality': return dataQuality(quote);
    case 'updated': return quote?.updated_at ? Date.parse(quote.updated_at) : -1;
    case 'group': return row.group;
  }
}

export function WatchlistTable({
  groups,
  quotes,
  identities,
  loadedAt,
  loading = false,
  onSelectTicker,
}: {
  groups: WatchlistMarketGroup[];
  quotes: Record<string, LiveQuote | null>;
  identities: Record<string, WatchlistSecurityIdentity>;
  loadedAt: number | null;
  loading?: boolean;
  onSelectTicker?: (ticker: string) => void;
}) {
  const t = useTranslations('market.table');
  const [sortKey, setSortKey] = useState<ColumnKey>('change');
  const [asc, setAsc] = useState(false);
  const [preset, setPreset] = useState<PresetKey>('market');
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(PRESET_COLUMNS.market);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [marketFilter, setMarketFilter] = useState<'all' | Market>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | QuoteDisplayStatus>('all');
  const [columnsOpen, setColumnsOpen] = useState(false);

  useEffect(() => {
    try {
      const savedPreset = localStorage.getItem('stock-monitor:watchlist:preset') as PresetKey | null;
      const savedColumns = JSON.parse(localStorage.getItem('stock-monitor:watchlist:columns') || 'null') as ColumnKey[] | null;
      if (savedPreset && PRESET_COLUMNS[savedPreset]) setPreset(savedPreset);
      if (savedColumns?.length) setVisibleColumns(savedColumns.filter((column) => ALL_COLUMNS.includes(column)));
    } catch {}
  }, []);

  const rows = useMemo(
    () => buildWatchlistMarketRows(groups, quotes, identities, loadedAt),
    [groups, quotes, identities, loadedAt],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (normalizedQuery && !`${row.ticker} ${row.name}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      if (groupFilter !== 'all' && row.group !== groupFilter) return false;
      if (marketFilter !== 'all' && row.market !== marketFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      return true;
    });
  }, [groupFilter, marketFilter, query, rows, statusFilter]);

  const sorted = useMemo(() => [...filtered].sort((left, right) => {
    const a = metricValue(left, sortKey);
    const b = metricValue(right, sortKey);
    const result = typeof a === 'string' && typeof b === 'string'
      ? a.localeCompare(b)
      : Number(a) - Number(b);
    return asc ? result : -result;
  }), [asc, filtered, sortKey]);

  const quotedRows = filtered.filter((row) => row.quote && row.quote.price > 0);
  const summary = {
    tracked: filtered.length,
    gainers: quotedRows.filter((row) => row.quote!.change_pct > 0).length,
    decliners: quotedRows.filter((row) => row.quote!.change_pct < 0).length,
    average: quotedRows.length
      ? quotedRows.reduce((sum, row) => sum + row.quote!.change_pct, 0) / quotedRows.length
      : null,
  };

  const applyPreset = (next: PresetKey) => {
    setPreset(next);
    setVisibleColumns(PRESET_COLUMNS[next]);
    try {
      localStorage.setItem('stock-monitor:watchlist:preset', next);
      localStorage.setItem('stock-monitor:watchlist:columns', JSON.stringify(PRESET_COLUMNS[next]));
    } catch {}
  };

  const toggleColumn = (column: ColumnKey) => {
    if ((column === 'ticker' || column === 'name') && visibleColumns.includes(column)) return;
    const next = visibleColumns.includes(column)
      ? visibleColumns.filter((item) => item !== column)
      : ALL_COLUMNS.filter((item) => visibleColumns.includes(item) || item === column);
    setVisibleColumns(next);
    try { localStorage.setItem('stock-monitor:watchlist:columns', JSON.stringify(next)); } catch {}
  };

  const sort = (key: ColumnKey) => {
    if (sortKey === key) setAsc((current) => !current);
    else {
      setSortKey(key);
      setAsc(key === 'ticker' || key === 'name' || key === 'group');
    }
  };

  const cell = (row: WatchlistMarketRow, key: ColumnKey) => {
    const quote = row.quote;
    const hasQuote = !!quote && quote.price > 0;
    switch (key) {
      case 'ticker': return <div className="flex items-center gap-2"><Link onClick={(event) => event.stopPropagation()} href={`/stock/${encodeURIComponent(row.ticker)}` as never} className="font-mono text-xs font-bold text-accent hover:no-underline">{row.ticker}</Link><span className="rounded border border-border bg-bg-elevated px-1 py-0.5 text-[8px] text-text-muted"><MarketLabel m={row.market} /></span></div>;
      case 'name': return <span className="block max-w-[190px] truncate font-medium text-text">{row.name}</span>;
      case 'price': return hasQuote ? <span className="font-semibold tabular-nums text-text">{formatPrice(quote.price, row.currency)}</span> : <span className="text-text-muted">--</span>;
      case 'change': return hasQuote ? <div className={`tabular-nums ${changeClass(quote.change_pct)}`}><div>{formatPct(quote.change_pct)}</div><div className="text-[10px] opacity-75">{formatChange(quote.change)}</div></div> : <span className="text-text-muted">--</span>;
      case 'dayRange': return hasQuote ? <><div className="tabular-nums">{formatPrice(quote.high, row.currency)}</div><div className="text-[10px] text-text-dim">{formatPrice(quote.low, row.currency)}</div></> : <span className="text-text-muted">--</span>;
      case 'volume': return hasQuote && quote.volume > 0 ? formatVolume(quote.volume) : <span className="text-text-muted">--</span>;
      case 'amount': return hasQuote && quote.amount > 0 ? formatVolume(quote.amount) : <span className="text-text-muted">--</span>;
      case 'marketCap': return quote?.market_cap_label && quote.market_cap_label !== '—' ? quote.market_cap_label : <span className="text-text-muted">--</span>;
      case 'pe': return optionalNumber(quote?.pe_ttm);
      case 'pb': return optionalNumber(quote?.pb);
      case 'turnover': return optionalNumber(quote?.turnover, '%');
      case 'volumeRatio': return optionalNumber(quote?.volume_ratio, 'x');
      case 'amplitude': return optionalNumber(quote?.amplitude, '%');
      case 'dayPosition': {
        const position = dayPosition(quote);
        return position == null ? <span className="text-text-muted">--</span> : (
          <div className="ml-auto w-24" title={t('dayPositionTitle', { value: position.toFixed(0) })}>
            <div className="h-1.5 overflow-hidden rounded bg-border"><div className="h-full bg-accent" style={{ width: `${position}%` }} /></div>
            <div className="mt-1 text-[10px] text-text-dim">{position.toFixed(0)}%</div>
          </div>
        );
      }
      case 'quality': {
        const quality = dataQuality(quote);
        return <span className={quality >= 75 ? 'text-up' : quality >= 45 ? 'text-warn' : 'text-text-muted'}>{quality}%</span>;
      }
      case 'updated': return <QuoteStatus row={row} />;
      case 'group': return <span className="inline-flex max-w-[150px] truncate rounded-full border border-border bg-bg-elevated px-2 py-0.5 text-[10px] text-text-dim">{row.group}</span>;
    }
  };

  if (rows.length === 0) return <div className="card-base text-center text-sm text-text-dim">{t('empty')}</div>;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-card shadow-[var(--shadow)]" data-density="data">
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
        {[
          [t('summary.tracked'), summary.tracked, 'text-text', 'bg-accent'],
          [t('summary.gainers'), summary.gainers, 'text-up', 'bg-up'],
          [t('summary.decliners'), summary.decliners, 'text-down', 'bg-down'],
          [t('summary.average'), summary.average == null ? '--' : formatPct(summary.average), summary.average == null ? 'text-text-muted' : changeClass(summary.average), summary.average != null && summary.average < 0 ? 'bg-down' : 'bg-up'],
        ].map(([label, value, tone, accent]) => (
          <div key={String(label)} className="relative overflow-hidden bg-bg-card px-4 py-3">
            <span className={`absolute inset-y-0 left-0 w-0.5 ${accent}`} />
            <div className="text-[10px] font-medium text-text-dim">{label}</div>
            <div className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-b border-border bg-bg-elevated/70 px-3 py-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex w-fit shrink-0 overflow-hidden rounded-md border border-border bg-bg p-0.5 text-xs" role="group" aria-label={t('presetAriaLabel')}>
            {(['market', 'valuation', 'risk'] as PresetKey[]).map((item) => (
              <button key={item} type="button" onClick={() => applyPreset(item)} aria-pressed={preset === item}
                className={`rounded px-3 py-1.5 transition ${preset === item ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-dim hover:text-text'}`}>
                {t(`presets.${item}`)}
              </button>
            ))}
          </div>
          <div className="relative w-full min-w-0 sm:w-[260px]">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('filters.search')} aria-label={t('filters.search')} className="w-full bg-bg py-1.5 pl-7 pr-2.5 text-xs" />
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 xl:ml-auto xl:overflow-visible xl:pb-0">
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label={t('filters.group')} className="px-2 py-1.5 text-xs">
            <option value="all">{t('filters.allGroups')}</option>
            {groups.map((group) => <option key={group.id} value={group.name}>{group.name}</option>)}
          </select>
          <select value={marketFilter} onChange={(event) => setMarketFilter(event.target.value as 'all' | Market)} aria-label={t('filters.market')} className="px-2 py-1.5 text-xs">
            <option value="all">{t('filters.allMarkets')}</option>
            {Array.from(new Set(rows.map((row) => row.market))).map((market) => <option key={market} value={market}>{market}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | QuoteDisplayStatus)} aria-label={t('filters.status')} className="px-2 py-1.5 text-xs">
            <option value="all">{t('filters.allStatuses')}</option>
            {(['live', 'delayed', 'unavailable'] as QuoteDisplayStatus[]).map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
          </select>
          <div className="relative ml-auto shrink-0">
            <button type="button" onClick={() => setColumnsOpen((open) => !open)} aria-expanded={columnsOpen} className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text-dim transition hover:border-border-active hover:text-text">
              {t('columns.action')}
            </button>
            {columnsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 grid w-64 grid-cols-2 gap-1 rounded-md border border-border bg-bg-elevated p-2 shadow-xl">
                {ALL_COLUMNS.map((column) => (
                  <label key={column} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-bg-card">
                    <input type="checkbox" checked={visibleColumns.includes(column)} disabled={(column === 'ticker' || column === 'name') && visibleColumns.includes(column)} onChange={() => toggleColumn(column)} />
                    <span>{t(`headers.${column}`)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="border-b border-border px-3 py-1.5 text-[11px] text-text-dim" role="status">{t('loadingQuotes')}</div>}
      {filtered.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-text-dim">{t('filters.noResults')}</div>
      ) : (
        <div className="max-h-[64vh] overflow-auto">
          <table aria-label={t('ariaLabel')} className="w-full min-w-max text-sm">
            <caption className="sr-only">{t('caption')}</caption>
            <thead>
              <tr className="border-b border-border bg-bg-elevated/95 text-[10px] text-text-dim">
                {visibleColumns.map((column) => (
                  <th key={column} className={`sticky top-0 z-10 whitespace-nowrap bg-bg-elevated/95 px-3 py-2.5 font-semibold ${NUMERIC_COLUMNS.has(column) ? 'text-right' : 'text-left'}`} aria-sort={sortKey === column ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => sort(column)} className="hover:text-text" aria-label={t('sortAriaLabel', { label: t(`headers.${column}`) })}>
                      {t(`headers.${column}`)}{sortKey === column ? (asc ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
                {onSelectTicker && <th className="sticky top-0 z-10 w-16 bg-bg-elevated/95 px-3 py-2.5 text-right font-semibold">{t('quickView')}</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.ticker} tabIndex={onSelectTicker ? 0 : undefined} onClick={() => onSelectTicker?.(row.ticker)} onKeyDown={(event) => { if (event.key === 'Enter') onSelectTicker?.(row.ticker); }}
                  className={`group border-b border-border/60 last:border-0 hover:bg-bg-hover ${onSelectTicker ? 'cursor-pointer focus:bg-bg-hover focus:outline-none' : ''}`}>
                  {visibleColumns.map((column) => (
                    <td key={column} className={`whitespace-nowrap px-3 py-3 transition-colors ${NUMERIC_COLUMNS.has(column) ? 'text-right tabular-nums' : ''}`}>{cell(row, column)}</td>
                  ))}
                  {onSelectTicker && <td className="px-3 py-3 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); onSelectTicker(row.ticker); }} className="rounded-md border border-transparent px-2 py-1 text-[10px] font-semibold text-text-dim transition group-hover:border-border group-hover:bg-bg-card group-hover:text-accent hover:!border-accent/30 hover:!bg-accent/10">{t('quickViewAction')}</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
