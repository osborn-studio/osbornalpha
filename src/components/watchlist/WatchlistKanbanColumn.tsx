'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Activity, Eye, GripVertical, MoreHorizontal, Newspaper, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MarketLabel } from '@/components/MarketLabel';
import { useToast } from '@/components/Toast';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import type { AssetType, Market } from '@/lib/supabase/database.types';
import { classifyAssetType } from '@/lib/stocks/asset-type';
import { normalizeWindTicker } from '@/lib/stocks/wind-normalize';
import { canAddResult, nextSearchAction } from '@/lib/watchlist/security-validation';
import type { WatchlistGroup } from '@/lib/watchlist/store';
import { trackEvent } from '@/lib/analytics/client';
import { changeClass, classifyMarket, currencyOfMarket, formatPct, formatPrice } from '@/lib/utils';
import { useDismissableLayer } from '@/lib/hooks/useDismissableLayer';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';

export interface WatchlistSecurityResult {
  t: string;
  n: string;
  py: string;
  m: Market;
  asset_type: AssetType;
  selectable?: boolean;
  verification_status?: string;
  list_status?: string;
}

interface ColumnProps {
  group: WatchlistGroup;
  allGroups: WatchlistGroup[];
  quotes: Record<string, LiveQuote | null>;
  securityIdentities: Record<string, WatchlistSecurityResult>;
  overviewByTicker?: Record<string, WatchlistOverviewRow>;
  loadedAt: number | null;
  isDropTarget: boolean;
  isColumnDropTarget: boolean;
  isBeingDragged: boolean;
  dragTicker: string | null;
  isAdding: boolean;
  openMenuTicker: string | null;
  onDragOver: (event: React.DragEvent) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  onColumnDragStart: (event: React.DragEvent) => void;
  onCardDragStart: (event: React.DragEvent, ticker: string) => void;
  onCardDragEnd: () => void;
  onRetryTicker: () => void;
  onAddOpen: () => void;
  onAddClose: () => void;
  onCardMove: (ticker: string, toGroupId: string) => void;
  onCardRemove: (ticker: string) => void;
  onOpenMenu: (ticker: string) => void;
  onQuickView: (ticker: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onTickerAdded: (info: WatchlistSecurityResult) => void;
}

export function WatchlistKanbanColumn(props: ColumnProps) {
  const t = useTranslations('market.watchlist.kanban');
  const shellClass = props.isBeingDragged
    ? 'border-border bg-bg-card opacity-40'
    : props.isColumnDropTarget
      ? 'border-accent bg-bg-card ring-2 ring-accent/40'
      : props.isDropTarget
        ? 'border-accent bg-accent-dim/10'
        : 'border-border bg-bg-card';

  return (
    <section
      className={`flex w-[min(85vw,300px)] max-h-[78vh] shrink-0 snap-start flex-col rounded-lg border ${shellClass} transition-all`}
      onDragOver={props.onDragOver}
      onDragEnter={props.onDragEnter}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      aria-label={props.group.name}
    >
      <header
        draggable
        onDragStart={props.onColumnDragStart}
        onDragEnd={props.onCardDragEnd}
        className="flex cursor-grab select-none items-center justify-between border-b border-border px-3 py-2.5 active:cursor-grabbing"
        title={t('reorderTitle')}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">{props.group.name}</span>
          <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-text-dim">{props.group.tickers.length}</span>
        </div>
        <div className="flex gap-0.5" onDragStart={(event) => event.preventDefault()}>
          <button type="button" onClick={(event) => { event.stopPropagation(); props.onRename(); }} title={t('rename')} aria-label={t('rename')} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
          <button type="button" onClick={(event) => { event.stopPropagation(); props.onDelete(); }} title={t('delete')} aria-label={t('delete')} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent hover:text-status-bad"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>
      </header>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {props.group.tickers.length === 0 && !props.isAdding && (
          <div className="rounded border border-dashed border-border/60 py-6 text-center text-[11px] text-text-muted">
            {t('dropHint')}<br />{t('orAddBelow')}
          </div>
        )}
        {props.group.tickers.map((ticker) => (
          <StockCard
            key={ticker}
            ticker={ticker}
            quote={props.quotes[ticker] || null}
            identity={props.securityIdentities[ticker]}
            overview={props.overviewByTicker?.[ticker]}
            loadedAt={props.loadedAt}
            isDragging={props.dragTicker === ticker}
            menuOpen={props.openMenuTicker === ticker}
            currentGroupId={props.group.id}
            allGroups={props.allGroups}
            onDragStart={(event) => props.onCardDragStart(event, ticker)}
            onDragEnd={props.onCardDragEnd}
            onMove={(to) => props.onCardMove(ticker, to)}
            onRemove={() => props.onCardRemove(ticker)}
            onRetry={props.onRetryTicker}
            onToggleMenu={() => props.onOpenMenu(ticker)}
            onQuickView={() => props.onQuickView(ticker)}
          />
        ))}
        {props.isAdding ? (
          <AddStockInline onAdd={props.onTickerAdded} onClose={props.onAddClose} />
        ) : (
          <button type="button" onClick={props.onAddOpen} className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-border bg-transparent px-2 py-2 text-xs text-text-dim hover:border-accent-dim hover:text-accent">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />{t('addStock')}
          </button>
        )}
      </div>
    </section>
  );
}

interface CardProps {
  ticker: string;
  quote: LiveQuote | null;
  identity?: WatchlistSecurityResult;
  overview?: WatchlistOverviewRow;
  loadedAt: number | null;
  isDragging: boolean;
  menuOpen: boolean;
  currentGroupId: string;
  allGroups: WatchlistGroup[];
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (toGroupId: string) => void;
  onRemove: () => void;
  onRetry: () => void;
  onToggleMenu: () => void;
  onQuickView: () => void;
}

function StockCard(props: CardProps) {
  const t = useTranslations('market.watchlist.kanban');
  const statusText = useTranslations('market.table.decisionStatuses');
  const market = props.quote?.market || props.identity?.m || classifyMarket(props.ticker);
  const name = props.quote?.name || props.identity?.n || props.ticker;
  const currency = props.quote?.currency || currencyOfMarket(market);
  const hasPrice = !!props.quote && props.quote.price > 0;
  const stale = props.quote?.stale === true;
  const failed = props.loadedAt !== null && !hasPrice;
  const otherGroups = props.allGroups.filter((group) => group.id !== props.currentGroupId);
  const { menuOpen, onToggleMenu } = props;
  const cardRef = useRef<HTMLElement>(null);
  useDismissableLayer(cardRef, menuOpen, onToggleMenu);

  return (
    <article
      ref={cardRef}
      draggable
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      className={`group relative rounded-md border bg-bg-elevated p-2.5 transition-all ${props.isDragging ? 'border-accent opacity-50 shadow-lg shadow-accent/20' : failed ? 'border-status-bad/40 hover:border-status-bad/70' : stale ? 'border-warn/40 hover:border-warn/70' : 'border-border hover:border-border-active'}`}
      style={{ cursor: props.isDragging ? 'grabbing' : 'grab', transform: props.isDragging ? 'rotate(-1.5deg) scale(0.98)' : undefined }}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/stock/${encodeURIComponent(props.ticker)}`} className="min-w-0 flex-1 text-text hover:no-underline">
          <div className="flex items-center gap-1.5"><span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim"><MarketLabel m={market} /></span><span className="truncate text-sm font-semibold">{name}</span></div>
          <div className="mt-0.5 font-mono text-[11px] text-text-muted">{props.ticker}</div>
        </Link>
        <button type="button" onClick={(event) => { event.stopPropagation(); event.preventDefault(); props.onToggleMenu(); }} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" title={t('moveMenu')} aria-label={t('moveMenu')} aria-expanded={props.menuOpen}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></button>
      </div>

      <button type="button" onClick={props.onQuickView} className="mt-1.5 flex w-full items-baseline justify-between gap-2 text-left" aria-label={t('quickView', { ticker: props.ticker })}>
        {hasPrice ? <><span className="text-base font-semibold tabular-nums">{currency}{formatPrice(props.quote!.price)}</span><span className={`text-xs tabular-nums ${changeClass(props.quote!.change_pct)}`}>{formatPct(props.quote!.change_pct)}</span>{stale && <span className="text-[9px] text-warn">{t('stale')}</span>}</> : failed ? <><span className="text-[11px] text-status-bad">{t('fetchFailed')}</span><span onClick={(event) => { event.stopPropagation(); props.onRetry(); }} className="inline-flex items-center gap-1 text-[10px] text-status-bad"><RefreshCw className="h-3 w-3" aria-hidden="true" />{t('retry')}</span></> : <><span className="text-text-muted">--</span><span className="text-xs text-text-muted">{t('loading')}</span></>}
      </button>
      {props.overview && (
        <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-border/60 pt-2 text-[9px] text-text-muted">
          <span className="shrink-0 rounded border border-border bg-bg-card px-1.5 py-0.5">{statusText(props.overview.item.status)}</span>
          <span className="inline-flex min-w-0 items-center gap-1" title={t('researchCount', { count: props.overview.research.value?.recentNewsCount ?? 0 })}><Newspaper className="h-3 w-3 shrink-0" aria-hidden="true" />{props.overview.research.value?.recentNewsCount ?? 0}</span>
          {props.overview.market?.value?.radar && <span className={`ml-auto inline-flex min-w-0 items-center gap-1 truncate ${props.overview.market.value.radar.level === 'red' ? 'text-down' : props.overview.market.value.radar.level === 'yellow' ? 'text-warn' : 'text-text-muted'}`} title={props.overview.market.value.radar.headline}><Activity className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{props.overview.market.value.radar.headline}</span></span>}
        </div>
      )}

      {props.menuOpen && (
        <div className="absolute right-2 top-9 z-20 w-44 rounded-md border border-border bg-bg-elevated p-1 shadow-lg" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { props.onQuickView(); props.onToggleMenu(); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bg-card"><Eye className="h-3.5 w-3.5" aria-hidden="true" />{t('openQuickView')}</button>
          <div className="my-1 border-t border-border" />
          <div className="px-2 py-1 text-[10px] font-semibold uppercase text-text-muted">{t('moveTo')}</div>
          {otherGroups.length === 0 && <div className="px-2 py-1 text-[11px] text-text-muted">{t('noOtherColumns')}</div>}
          {otherGroups.map((group) => <button type="button" key={group.id} onClick={() => { props.onMove(group.id); props.onToggleMenu(); }} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-bg-card">{t('moveToArrow', { name: group.name })}</button>)}
          <div className="my-1 border-t border-border" />
          <button type="button" onClick={() => { props.onRemove(); props.onToggleMenu(); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-status-bad hover:bg-status-bad/10"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{t('removeFromWatchlist')}</button>
        </div>
      )}
    </article>
  );
}

function AddStockInline({ onAdd, onClose }: { onAdd: (info: WatchlistSecurityResult) => void; onClose: () => void }) {
  const t = useTranslations('market.watchlist.kanban');
  const assetTypes = useTranslations('market.watchlist.assetTypes');
  const { show } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WatchlistSecurityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<'unavailable' | 'failed' | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => () => { abortRef.current?.abort(); if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  async function runSearch(value: string) {
    trackEvent('stock_search_submitted', { query_length: value.length });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSearchError(null);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResults([]);
        setSearchError(body?.error === 'security_master_unavailable' ? 'unavailable' : 'failed');
        return;
      }
      let next = (body.results || []).map((result: Omit<WatchlistSecurityResult, 'asset_type'> & { asset_type?: AssetType }) => ({ ...result, asset_type: result.asset_type ?? classifyAssetType({ ticker: result.t, name: result.n }) }));
      if (nextSearchAction({ localResults: next, query: value }) === 'resolve') {
        const resolvedResponse = await fetch('/api/securities/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: value }), signal: controller.signal });
        if (resolvedResponse.ok) {
          const resolved = await resolvedResponse.json();
          next = resolved.result ? [{ ...resolved.result, asset_type: resolved.result.asset_type ?? classifyAssetType({ ticker: resolved.result.t, name: resolved.result.n }) }] : [];
        } else if (resolvedResponse.status !== 404) setSearchError(resolvedResponse.status === 503 ? 'unavailable' : 'failed');
      }
      setResults(next);
      setFocusIndex(next.findIndex(canAddResult));
      trackEvent('stock_search_completed', { query_length: value.length, results: next.length });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setResults([]);
      setSearchError('failed');
      trackEvent('stock_search_failed', { query_length: value.length });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function changeQuery(value: string) {
    setQuery(value);
    setSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => void runSearch(value.trim()), 250);
  }

  function select(result: WatchlistSecurityResult) {
    if (!canAddResult(result)) return;
    onAdd(result);
    setQuery('');
    setResults([]);
    show(t('addedSelection', { ticker: result.t }));
    inputRef.current?.focus();
  }

  function confirm() {
    const focused = focusIndex >= 0 ? results[focusIndex] : undefined;
    const target = focused && canAddResult(focused) ? focused : results.find(canAddResult);
    if (target) select(target);
    else if (query.trim()) void runSearch(query.trim());
  }

  return (
    <div className="rounded-md border border-accent-dim bg-bg-elevated p-2">
      <input ref={inputRef} value={query} onChange={(event) => changeQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); confirm(); }
        else if (event.key === 'Escape') onClose();
        else if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setFocusIndex((index) => (index + 1) % results.length); }
        else if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setFocusIndex((index) => (index - 1 + results.length) % results.length); }
      }} placeholder={t('searchPlaceholder')} className="w-full text-xs" autoComplete="off" />
      {results.length > 0 && <div className="mt-1.5 max-h-44 overflow-y-auto rounded border border-border bg-bg-card">{results.map((result, index) => <button type="button" key={`${result.t}-${index}`} onClick={() => select(result)} onMouseEnter={() => setFocusIndex(index)} disabled={!canAddResult(result)} className={`grid w-full grid-cols-[auto_1fr] items-center gap-2 border-b border-border px-2 py-1.5 text-left last:border-b-0 ${index === focusIndex ? 'bg-bg-elevated' : 'hover:bg-bg-elevated'} disabled:cursor-not-allowed disabled:opacity-50`}><span className="rounded bg-bg-elevated px-1 py-0.5 text-[9px] font-semibold text-text-dim"><MarketLabel m={result.m} /></span><span className="min-w-0"><span className="block truncate text-xs font-semibold">{result.n}</span><span className="flex flex-wrap items-center gap-1 text-[10px] text-text-dim"><span>{result.t}</span><span aria-hidden="true">/</span><span>{assetTypes(result.asset_type)}</span>{!canAddResult(result) && <span>{t('pendingVerification')}</span>}</span></span></button>)}</div>}
      {query.trim() && !loading && results.length === 0 && <div className="mt-1.5 text-[10px] text-text-muted">{searchError === 'unavailable' ? t('searchUnavailable') : searchError ? t('searchFailed') : t('noMatch', { query: query.trim() })}{!searchError && normalizeWindTicker(query.trim()) !== query.trim().toUpperCase() ? ` ${t('normalizedNote', { canonical: normalizeWindTicker(query.trim()) })}` : ''}</div>}
      <div className="mt-1.5 flex gap-1.5"><button type="button" onClick={confirm} disabled={loading || !results.some(canAddResult)} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded bg-accent-dim px-2 text-[11px] font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" aria-hidden="true" />{loading ? t('searching') : t('add')}</button><button type="button" onClick={onClose} className="h-8 rounded border border-border px-2 text-[11px] text-text-dim">{t('done')}</button></div>
    </div>
  );
}
