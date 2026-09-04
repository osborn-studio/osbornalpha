'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Columns3, LoaderCircle, Minus, MoveRight, PanelRightOpen, Plus, Rows3, Search, Tag, Trash2, X } from 'lucide-react';
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
import { WatchlistMobileList } from '@/components/watchlist/WatchlistMobileList';
import type { WatchlistOverviewRow as WatchlistOverviewClientRow } from '@/lib/watchlist/overview-contract';
import { summarizeWatchlistMarketRows } from '@/lib/watchlist/summary';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useDismissableLayer } from '@/lib/hooks/useDismissableLayer';

type ColumnKey =
  | 'ticker' | 'name' | 'price' | 'change' | 'open' | 'prevClose' | 'dayRange' | 'volume' | 'amount'
  | 'marketCap' | 'pe' | 'pb' | 'turnover' | 'volumeRatio' | 'amplitude'
  | 'dayPosition' | 'oneYearReturn' | 'volatility' | 'maxDrawdown' | 'rangePosition'
  | 'rsi14' | 'macdHistogram' | 'bollingerPosition' | 'atr14'
  | 'research' | 'decision' | 'quality' | 'updated' | 'group';
type PresetKey = 'market' | 'valuation' | 'risk';
type Density = 'compact' | 'comfortable';

interface TablePreferences {
  sortKey: ColumnKey;
  asc: boolean;
  preset: PresetKey;
  visibleColumns: ColumnKey[];
  query: string;
  groupFilter: string;
  marketFilter: 'all' | Market;
  statusFilter: 'all' | QuoteDisplayStatus;
  density: Density;
}

const ALL_COLUMNS: ColumnKey[] = [
  'ticker', 'name', 'price', 'change', 'open', 'prevClose', 'dayRange', 'volume', 'amount', 'marketCap',
  'pe', 'pb', 'turnover', 'volumeRatio', 'amplitude', 'dayPosition', 'quality', 'updated', 'group',
  'oneYearReturn', 'volatility', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'research', 'decision',
];

const PRESET_COLUMNS: Record<PresetKey, ColumnKey[]> = {
  market: ['ticker', 'name', 'price', 'change', 'open', 'dayRange', 'volume', 'amount', 'volumeRatio', 'updated', 'group'],
  valuation: ['ticker', 'name', 'price', 'change', 'marketCap', 'pe', 'pb', 'turnover', 'updated', 'group'],
  risk: ['ticker', 'name', 'price', 'change', 'oneYearReturn', 'volatility', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'research', 'decision', 'updated', 'group'],
};

const NUMERIC_COLUMNS = new Set<ColumnKey>([
  'price', 'change', 'open', 'prevClose', 'volume', 'amount', 'marketCap', 'pe', 'pb', 'turnover',
  'volumeRatio', 'amplitude', 'dayPosition', 'quality', 'updated',
  'oneYearReturn', 'volatility', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14',
]);

const DEFAULT_PREFERENCES: TablePreferences = {
  sortKey: 'change', asc: false, preset: 'market', visibleColumns: PRESET_COLUMNS.market,
  query: '', groupFilter: 'all', marketFilter: 'all', statusFilter: 'all', density: 'comfortable',
};

function validPreferences(value: unknown): value is TablePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Partial<TablePreferences>;
  return typeof input.sortKey === 'string' && ALL_COLUMNS.includes(input.sortKey as ColumnKey)
    && typeof input.asc === 'boolean'
    && typeof input.preset === 'string' && input.preset in PRESET_COLUMNS
    && Array.isArray(input.visibleColumns) && input.visibleColumns.length > 0
    && input.visibleColumns.every((column) => ALL_COLUMNS.includes(column))
    && typeof input.query === 'string'
    && typeof input.groupFilter === 'string'
    && (input.marketFilter === 'all' || ['A', 'HK', 'US', 'JP', 'KR', 'TW'].includes(String(input.marketFilter)))
    && (input.statusFilter === 'all' || ['loading', 'live', 'delayed', 'unavailable'].includes(String(input.statusFilter)))
    && (input.density === 'compact' || input.density === 'comfortable');
}

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

function metricValue(row: WatchlistMarketRow, key: ColumnKey, overview?: WatchlistOverviewClientRow): string | number {
  const quote = row.quote;
  switch (key) {
    case 'ticker': return row.ticker;
    case 'name': return row.name;
    case 'price': return quote?.price ?? -1;
    case 'change': return quote?.change_pct ?? -Infinity;
    case 'open': return quote?.open ?? -1;
    case 'prevClose': return quote?.prev_close ?? -1;
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
    case 'oneYearReturn': return overview?.history?.value?.periodReturnPct ?? -Infinity;
    case 'volatility': return overview?.history?.value?.annualizedVolatilityPct ?? -Infinity;
    case 'maxDrawdown': return overview?.history?.value?.maxDrawdownPct ?? -Infinity;
    case 'rangePosition': return overview?.history?.value?.rangePositionPct ?? -1;
    case 'rsi14': return overview?.history?.value?.rsi14 ?? -1;
    case 'macdHistogram': return overview?.history?.value?.macdHistogram ?? -Infinity;
    case 'bollingerPosition': return overview?.history?.value?.bollingerPositionPct ?? -1;
    case 'atr14': return overview?.history?.value?.atr14Pct ?? -1;
    case 'research': return overview?.research.value?.recentNewsCount ?? -1;
    case 'decision': return overview?.item.status ?? '';
    case 'quality': return dataQuality(quote);
    case 'updated': return quote?.updated_at ? Date.parse(quote.updated_at) : -1;
    case 'group': return row.group;
  }
}

export function WatchlistTable({
  groups,
  quotes,
  identities,
  overviewByTicker = {},
  loadedAt,
  loading = false,
  onSelectTicker,
  onMoveTickers,
  onRemoveTickers,
  onTagTickers,
  overviewHasMore = false,
  overviewLoadingMore = false,
  onLoadMoreOverview,
}: {
  groups: WatchlistMarketGroup[];
  quotes: Record<string, LiveQuote | null>;
  identities: Record<string, WatchlistSecurityIdentity>;
  overviewByTicker?: Record<string, WatchlistOverviewClientRow>;
  loadedAt: number | null;
  loading?: boolean;
  onSelectTicker?: (ticker: string) => void;
  onMoveTickers?: (tickers: string[], groupId: string) => void;
  onRemoveTickers?: (tickers: string[]) => void;
  onTagTickers?: (tickers: string[], tag: string, mode: 'add' | 'remove') => Promise<boolean>;
  overviewHasMore?: boolean;
  overviewLoadingMore?: boolean;
  onLoadMoreOverview?: () => Promise<void>;
}) {
  const t = useTranslations('market.table');
  const [preferences, setPreferences] = usePersistentState('stock-monitor:watchlist:table-preferences-v1', DEFAULT_PREFERENCES, validPreferences);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchGroupId, setBatchGroupId] = useState(groups[0]?.id ?? '');
  const [batchTag, setBatchTag] = useState('');
  const [tagSaving, setTagSaving] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);
  useDismissableLayer(columnsRef, columnsOpen, () => setColumnsOpen(false));
  const { sortKey, asc, preset, visibleColumns, query, groupFilter, marketFilter, statusFilter, density } = preferences;

  const rows = useMemo(
    () => buildWatchlistMarketRows(groups, quotes, identities, loadedAt),
    [groups, quotes, identities, loadedAt],
  );

  useEffect(() => {
    const available = new Set(rows.map((row) => row.ticker));
    setSelected((current) => new Set([...current].filter((ticker) => available.has(ticker))));
    if (!groups.some((group) => group.id === batchGroupId)) setBatchGroupId(groups[0]?.id ?? '');
  }, [batchGroupId, groups, rows]);

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
    const a = metricValue(left, sortKey, overviewByTicker[left.ticker]);
    const b = metricValue(right, sortKey, overviewByTicker[right.ticker]);
    const result = typeof a === 'string' && typeof b === 'string'
      ? a.localeCompare(b)
      : Number(a) - Number(b);
    return asc ? result : -result;
  }), [asc, filtered, overviewByTicker, sortKey]);

  const summary = summarizeWatchlistMarketRows(filtered);
  const allVisibleSelected = sorted.length > 0 && sorted.every((row) => selected.has(row.ticker));
  const toggleSelection = (ticker: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
    return next;
  });
  const clearSelection = () => setSelected(new Set());
  const updateTags = async (mode: 'add' | 'remove') => {
    const tag = batchTag.trim();
    if (!tag || !onTagTickers) return;
    setTagSaving(true);
    const updated = await onTagTickers([...selected], tag, mode);
    setTagSaving(false);
    if (updated) {
      setBatchTag('');
      clearSelection();
    }
  };

  const applyPreset = (next: PresetKey) => {
    setPreferences((current) => ({ ...current, preset: next, visibleColumns: PRESET_COLUMNS[next] }));
  };

  const toggleColumn = (column: ColumnKey) => {
    if ((column === 'ticker' || column === 'name') && visibleColumns.includes(column)) return;
    const next = visibleColumns.includes(column)
      ? visibleColumns.filter((item) => item !== column)
      : ALL_COLUMNS.filter((item) => visibleColumns.includes(item) || item === column);
    setPreferences((current) => ({ ...current, visibleColumns: next }));
  };

  const moveColumn = (column: ColumnKey, offset: -1 | 1) => {
    const index = visibleColumns.indexOf(column);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= visibleColumns.length) return;
    const next = [...visibleColumns];
    [next[index], next[target]] = [next[target], next[index]];
    setPreferences((current) => ({ ...current, visibleColumns: next }));
  };

  const sort = (key: ColumnKey) => {
    setPreferences((current) => sortKey === key
      ? { ...current, asc: !current.asc }
      : { ...current, sortKey: key, asc: key === 'ticker' || key === 'name' || key === 'group' });
  };

  const cell = (row: WatchlistMarketRow, key: ColumnKey) => {
    const quote = row.quote;
    const overview = overviewByTicker[row.ticker];
    const hasQuote = !!quote && quote.price > 0;
    switch (key) {
      case 'ticker': return <div className="flex items-center gap-2"><Link onClick={(event) => event.stopPropagation()} href={`/stock/${encodeURIComponent(row.ticker)}` as never} className="font-mono text-xs font-bold text-accent hover:no-underline">{row.ticker}</Link><span className="rounded border border-border bg-bg-elevated px-1 py-0.5 text-[8px] text-text-muted"><MarketLabel m={row.market} /></span></div>;
      case 'name': return <span className="block max-w-[190px] truncate font-medium text-text">{row.name}</span>;
      case 'price': return hasQuote ? <span className="font-semibold tabular-nums text-text">{formatPrice(quote.price, row.currency)}</span> : <span className="text-text-muted">--</span>;
      case 'change': return hasQuote ? <div className={`tabular-nums ${changeClass(quote.change_pct)}`}><div>{formatPct(quote.change_pct)}</div><div className="text-[10px] opacity-75">{formatChange(quote.change)}</div></div> : <span className="text-text-muted">--</span>;
      case 'open': return hasQuote ? <span className="tabular-nums">{formatPrice(quote.open, row.currency)}</span> : <span className="text-text-muted">--</span>;
      case 'prevClose': return hasQuote ? <span className="tabular-nums">{formatPrice(quote.prev_close, row.currency)}</span> : <span className="text-text-muted">--</span>;
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
      case 'oneYearReturn': {
        const value = overview?.history?.value?.periodReturnPct;
        return value == null ? <span className="text-text-muted">--</span> : <span className={changeClass(value)}>{value.toFixed(2)}%</span>;
      }
      case 'volatility': return optionalNumber(overview?.history?.value?.annualizedVolatilityPct, '%');
      case 'maxDrawdown': {
        const value = overview?.history?.value?.maxDrawdownPct;
        return value == null ? <span className="text-text-muted">--</span> : <span className="text-warn">{value.toFixed(2)}%</span>;
      }
      case 'rangePosition': {
        const value = overview?.history?.value?.rangePositionPct;
        return value == null ? <span className="text-text-muted">--</span> : (
          <div className="ml-auto w-24"><div className="h-1.5 overflow-hidden rounded bg-border"><div className="h-full bg-accent" style={{ width: `${value}%` }} /></div><div className="mt-1 text-[10px] text-text-dim">{value.toFixed(0)}%</div></div>
        );
      }
      case 'rsi14': return optionalNumber(overview?.history?.value?.rsi14);
      case 'macdHistogram': {
        const value = overview?.history?.value?.macdHistogram;
        return value == null ? <span className="text-text-muted">--</span> : <span className={changeClass(value)}>{value.toFixed(2)}</span>;
      }
      case 'bollingerPosition': {
        const value = overview?.history?.value?.bollingerPositionPct;
        return value == null ? <span className="text-text-muted">--</span> : (
          <div className="ml-auto w-24"><div className="h-1.5 overflow-hidden rounded bg-border"><div className="h-full bg-accent" style={{ width: `${value}%` }} /></div><div className="mt-1 text-[10px] text-text-dim">{value.toFixed(0)}%</div></div>
        );
      }
      case 'atr14': return optionalNumber(overview?.history?.value?.atr14Pct, '%');
      case 'research': {
        const research = overview?.research.value;
        if (!research) return <span className="text-text-muted">--</span>;
        return <div className="flex items-center justify-end gap-1.5"><span className="font-mono text-xs">{research.recentNewsCount}</span>{research.perspectiveDivergence && <span className="rounded border border-warn/30 bg-warn/10 px-1 py-0.5 text-[9px] text-warn">{t('researchDivergence')}</span>}</div>;
      }
      case 'decision': return overview?.item.status
        ? <span className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-dim">{t(`decisionStatuses.${overview.item.status}`)}</span>
        : <span className="text-text-muted">--</span>;
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
          [t('summary.average'), summary.averageChangePct == null ? '--' : formatPct(summary.averageChangePct), summary.averageChangePct == null ? 'text-text-muted' : changeClass(summary.averageChangePct), summary.averageChangePct != null && summary.averageChangePct < 0 ? 'bg-down' : 'bg-up'],
        ].map(([label, value, tone, accent]) => (
          <div key={String(label)} className="relative overflow-hidden bg-bg-card px-4 py-3">
            <span className={`absolute inset-y-0 left-0 w-0.5 ${accent}`} />
            <div className="text-[10px] font-medium text-text-dim">{label}</div>
            <div className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-bg-card px-4 py-2 text-[10px] text-text-muted" aria-label={t('summary.quoteStatusAriaLabel')}>
        <span className="font-medium text-text-dim">{t('summary.quoteStatus')}</span>
        <span className="inline-flex items-center gap-1.5 text-text-dim"><span className="h-1.5 w-1.5 rounded-full bg-text-muted" />{t('summary.loading')}: {summary.loading}</span>
        <span className="inline-flex items-center gap-1.5 text-up"><span className="h-1.5 w-1.5 rounded-full bg-up" />{t('summary.live')}: {summary.live}</span>
        <span className="inline-flex items-center gap-1.5 text-warn"><span className="h-1.5 w-1.5 rounded-full bg-warn" />{t('summary.delayed')}: {summary.delayed}</span>
        <span className="inline-flex items-center gap-1.5 text-down"><span className="h-1.5 w-1.5 rounded-full bg-down" />{t('summary.unavailable')}: {summary.unavailable}</span>
        {summary.medianChangePct != null && <span className={changeClass(summary.medianChangePct)}>{t('summary.median')}: {formatPct(summary.medianChangePct)}</span>}
        {summary.breadthPct != null && <span className={changeClass(summary.breadthPct)}>{t('summary.breadth')}: {formatPct(summary.breadthPct)}</span>}
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
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input value={query} onChange={(event) => setPreferences((current) => ({ ...current, query: event.target.value }))} placeholder={t('filters.search')} aria-label={t('filters.search')} className="w-full bg-bg py-1.5 pl-7 pr-2.5 text-xs" />
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 xl:ml-auto xl:overflow-visible xl:pb-0">
          <select value={groupFilter} onChange={(event) => setPreferences((current) => ({ ...current, groupFilter: event.target.value }))} aria-label={t('filters.group')} className="px-2 py-1.5 text-xs">
            <option value="all">{t('filters.allGroups')}</option>
            {groups.map((group) => <option key={group.id} value={group.name}>{group.name}</option>)}
          </select>
          <select value={marketFilter} onChange={(event) => setPreferences((current) => ({ ...current, marketFilter: event.target.value as 'all' | Market }))} aria-label={t('filters.market')} className="px-2 py-1.5 text-xs">
            <option value="all">{t('filters.allMarkets')}</option>
            {Array.from(new Set(rows.map((row) => row.market))).map((market) => <option key={market} value={market}>{market}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setPreferences((current) => ({ ...current, statusFilter: event.target.value as 'all' | QuoteDisplayStatus }))} aria-label={t('filters.status')} className="px-2 py-1.5 text-xs">
            <option value="all">{t('filters.allStatuses')}</option>
            {(['live', 'delayed', 'unavailable'] as QuoteDisplayStatus[]).map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
          </select>
          <button type="button" onClick={() => setPreferences((current) => ({ ...current, density: current.density === 'compact' ? 'comfortable' : 'compact' }))} className="icon-button !h-8 !w-8 !basis-8" title={t(`density.${density}`)} aria-label={t(`density.${density}`)}><Rows3 className="h-3.5 w-3.5" aria-hidden="true" /></button>
          <div ref={columnsRef} className="relative ml-auto shrink-0">
            <button type="button" onClick={() => setColumnsOpen((open) => !open)} aria-expanded={columnsOpen} className="icon-button !h-8 !w-8 !basis-8" title={t('columns.action')} aria-label={t('columns.action')}>
              <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {columnsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-border bg-bg-elevated p-2 shadow-xl">
                {ALL_COLUMNS.map((column) => (
                  <div key={column} className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-bg-card">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 py-1"><input type="checkbox" checked={visibleColumns.includes(column)} disabled={(column === 'ticker' || column === 'name') && visibleColumns.includes(column)} onChange={() => toggleColumn(column)} /><span className="truncate">{t(`headers.${column}`)}</span></label>
                    {visibleColumns.includes(column) && <><button type="button" onClick={() => moveColumn(column, -1)} disabled={visibleColumns[0] === column} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t('columns.moveUp')}><ArrowUp className="h-3 w-3" aria-hidden="true" /></button><button type="button" onClick={() => moveColumn(column, 1)} disabled={visibleColumns.at(-1) === column} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t('columns.moveDown')}><ArrowDown className="h-3 w-3" aria-hidden="true" /></button></>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="border-b border-border px-3 py-1.5 text-[11px] text-text-dim" role="status">{t('loadingQuotes')}</div>}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-accent/20 bg-accent/5 px-3 py-2">
          <span className="mr-auto text-xs font-semibold text-text">{t('selection.count', { count: selected.size })}</span>
          <div className="flex min-w-[190px] items-center gap-1">
            <Tag className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
            <input value={batchTag} maxLength={32} onChange={(event) => setBatchTag(event.target.value)} placeholder={t('selection.tagPlaceholder')} aria-label={t('selection.tagPlaceholder')} className="h-8 min-w-0 flex-1 py-1 text-xs" />
            <button type="button" disabled={!batchTag.trim() || tagSaving || !onTagTickers} onClick={() => void updateTags('add')} className="icon-button !h-8 !w-8 !basis-8" title={t('selection.addTag')} aria-label={t('selection.addTag')}><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
            <button type="button" disabled={!batchTag.trim() || tagSaving || !onTagTickers} onClick={() => void updateTags('remove')} className="icon-button !h-8 !w-8 !basis-8" title={t('selection.removeTag')} aria-label={t('selection.removeTag')}><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
          <select value={batchGroupId} onChange={(event) => setBatchGroupId(event.target.value)} aria-label={t('selection.targetGroup')} className="h-8 py-1 text-xs">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
          <button type="button" disabled={!batchGroupId || !onMoveTickers} onClick={() => { onMoveTickers?.([...selected], batchGroupId); clearSelection(); }} className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-bg-elevated px-2.5 text-xs text-text disabled:opacity-50"><MoveRight className="h-3.5 w-3.5" aria-hidden="true" />{t('selection.move')}</button>
          <button type="button" disabled={!onRemoveTickers} onClick={() => { onRemoveTickers?.([...selected]); clearSelection(); }} className="inline-flex h-8 items-center gap-1.5 rounded border border-down/30 px-2.5 text-xs text-down disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{t('selection.remove')}</button>
          <button type="button" onClick={clearSelection} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent" aria-label={t('selection.clear')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-text-dim">{t('filters.noResults')}</div>
      ) : (
        <>
        <WatchlistMobileList rows={sorted} onSelect={onSelectTicker} selected={selected} onToggle={toggleSelection} />
        <div className="hidden max-h-[64vh] overflow-auto sm:block">
          <table aria-label={t('ariaLabel')} className="w-full min-w-max text-sm">
            <caption className="sr-only">{t('caption')}</caption>
            <thead>
              <tr className="border-b border-border bg-bg-elevated/95 text-[10px] text-text-dim">
                <th className="sticky left-0 top-0 z-30 w-10 bg-bg-elevated/95 px-2 py-2.5"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((current) => { const next = new Set(current); if (allVisibleSelected) sorted.forEach((row) => next.delete(row.ticker)); else sorted.forEach((row) => next.add(row.ticker)); return next; })} aria-label={t('selection.all')} /></th>
                {visibleColumns.map((column) => (
                  <th key={column} className={`sticky top-0 whitespace-nowrap bg-bg-elevated/95 px-3 py-2.5 font-semibold ${column === 'ticker' ? 'left-10 z-20 min-w-[126px]' : 'z-10'} ${NUMERIC_COLUMNS.has(column) ? 'text-right' : 'text-left'}`} aria-sort={sortKey === column ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => sort(column)} className="hover:text-text" aria-label={t('sortAriaLabel', { label: t(`headers.${column}`) })}>
                      {t(`headers.${column}`)}{sortKey === column ? (asc ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
                {onSelectTicker && <th className="sticky right-0 top-0 z-30 w-16 bg-bg-elevated/95 px-3 py-2.5 text-right font-semibold">{t('quickView')}</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.ticker} tabIndex={onSelectTicker ? 0 : undefined} onClick={() => onSelectTicker?.(row.ticker)} onKeyDown={(event) => { if (event.key === 'Enter') onSelectTicker?.(row.ticker); }}
                  className={`group border-b border-border/60 last:border-0 hover:bg-bg-hover ${onSelectTicker ? 'cursor-pointer focus:bg-bg-hover focus:outline-none' : ''}`}>
                  <td className="sticky left-0 z-10 w-10 bg-bg-card px-2 text-center group-hover:bg-bg-hover"><input type="checkbox" checked={selected.has(row.ticker)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelection(row.ticker)} aria-label={t('selection.toggle', { ticker: row.ticker })} /></td>
                  {visibleColumns.map((column) => (
                    <td key={column} className={`whitespace-nowrap px-3 ${density === 'compact' ? 'py-1.5' : 'py-3'} transition-colors ${column === 'ticker' ? 'sticky left-10 z-[5] bg-bg-card group-hover:bg-bg-hover' : ''} ${NUMERIC_COLUMNS.has(column) ? 'text-right tabular-nums' : ''}`}>{cell(row, column)}</td>
                  ))}
                  {onSelectTicker && <td className="sticky right-0 z-10 bg-bg-card px-3 py-3 text-right group-hover:bg-bg-hover"><button type="button" onClick={(event) => { event.stopPropagation(); onSelectTicker(row.ticker); }} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" title={t('quickViewAction')} aria-label={t('quickViewAction')}><PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {overviewHasMore && (
        <div className="flex justify-center border-t border-border bg-bg-elevated/50 px-3 py-2">
          <button type="button" disabled={overviewLoadingMore} onClick={() => void onLoadMoreOverview?.()} className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-bg-card px-3 text-xs text-text-dim disabled:opacity-50">
            {overviewLoadingMore && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{t(overviewLoadingMore ? 'overview.loadingMore' : 'overview.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
