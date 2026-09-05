'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { Activity, Eye, GripVertical, MoreHorizontal, Newspaper, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MarketLabel } from '@/components/MarketLabel';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import type { WatchlistGroup } from '@/lib/watchlist/store';
import { changeClass, classifyMarket, currencyOfMarket, formatPct, formatPrice } from '@/lib/utils';
import { useDismissableLayer } from '@/lib/hooks/useDismissableLayer';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import { WatchlistSecuritySearch } from './WatchlistSecuritySearch';
import type { WatchlistSecurityIdentity as WatchlistSecurityResult } from '@/lib/watchlist/security-identity';

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
  onCardKeyboardMove: (ticker: string, direction: 'left' | 'right' | 'up' | 'down') => void;
  onColumnKeyboardMove: (direction: 'left' | 'right') => void;
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
        tabIndex={0}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !event.altKey) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            props.onColumnKeyboardMove(event.key === 'ArrowLeft' ? 'left' : 'right');
          }
        }}
        draggable
        onDragStart={props.onColumnDragStart}
        onDragEnd={props.onCardDragEnd}
        className="flex cursor-grab select-none items-center justify-between border-b border-border px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent active:cursor-grabbing"
        title={t('reorderTitle')}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">{props.group.name}</span>
          <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[11px] tabular-nums text-text-dim">{props.group.tickers.length}</span>
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
            onKeyboardMove={(direction) => props.onCardKeyboardMove(ticker, direction)}
          />
        ))}
        {props.isAdding ? (
          <WatchlistSecuritySearch onAdd={props.onTickerAdded} onClose={props.onAddClose} />
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
  onKeyboardMove: (direction: 'left' | 'right' | 'up' | 'down') => void;
}

function StockCard(props: CardProps) {
  const t = useTranslations('market.watchlist.kanban');
  const statusText = useTranslations('market.table.decisionStatuses');
  const market = props.quote?.market || props.identity?.m || classifyMarket(props.ticker);
  const name = props.identity?.n || props.quote?.name || props.ticker;
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
      data-watchlist-card={props.ticker}
      tabIndex={0}
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
      onKeyDown={(event) => {
        if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        props.onKeyboardMove(event.key.replace('Arrow', '').toLocaleLowerCase() as 'left' | 'right' | 'up' | 'down');
      }}
      draggable
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      className={`group relative rounded-md border bg-bg-elevated p-2.5 outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent ${props.isDragging ? 'border-accent opacity-50 shadow-lg shadow-accent/20' : failed ? 'border-status-bad/40 hover:border-status-bad/70' : stale ? 'border-warn/40 hover:border-warn/70' : 'border-border hover:border-border-active'}`}
      style={{ cursor: props.isDragging ? 'grabbing' : 'grab', transform: props.isDragging ? 'rotate(-1.5deg) scale(0.98)' : undefined }}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/stock/${encodeURIComponent(props.ticker)}`} className="min-w-0 flex-1 text-text hover:no-underline">
          <div className="flex items-center gap-1.5"><span className="rounded bg-bg-card px-1.5 py-0.5 text-[11px] font-semibold text-text-dim"><MarketLabel m={market} /></span><span className="truncate text-sm font-semibold">{name}</span></div>
          <div className="mt-0.5 font-mono text-[11px] text-text-muted">{props.ticker}</div>
        </Link>
        <button type="button" onClick={(event) => { event.stopPropagation(); event.preventDefault(); props.onToggleMenu(); }} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" title={t('moveMenu')} aria-label={t('moveMenu')} aria-expanded={props.menuOpen}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></button>
      </div>

      <button type="button" onClick={props.onQuickView} className="mt-1.5 flex w-full items-baseline justify-between gap-2 text-left" aria-label={t('quickView', { ticker: props.ticker })}>
        {hasPrice ? <><span className="text-base font-semibold tabular-nums">{currency}{formatPrice(props.quote!.price)}</span><span className={`text-xs tabular-nums ${changeClass(props.quote!.change_pct)}`}>{formatPct(props.quote!.change_pct)}</span>{stale && <span className="text-[11px] text-warn">{t('stale')}</span>}</> : failed ? <><span className="text-[11px] text-status-bad">{t('fetchFailed')}</span><span onClick={(event) => { event.stopPropagation(); props.onRetry(); }} className="inline-flex items-center gap-1 text-[11px] text-status-bad"><RefreshCw className="h-3 w-3" aria-hidden="true" />{t('retry')}</span></> : <><span className="text-text-muted">--</span><span className="text-xs text-text-muted">{t('loading')}</span></>}
      </button>
      {props.overview && (
        <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-border/60 pt-2 text-[11px] text-text-muted">
          <span className="shrink-0 rounded border border-border bg-bg-card px-1.5 py-0.5">{statusText(props.overview.item.status)}</span>
          <span className="inline-flex min-w-0 items-center gap-1" title={t('researchCount', { count: props.overview.research.value?.recentNewsCount ?? 0 })}><Newspaper className="h-3 w-3 shrink-0" aria-hidden="true" />{props.overview.research.value?.recentNewsCount ?? 0}</span>
          {props.overview.market?.value?.radar && <span className={`ml-auto inline-flex min-w-0 items-center gap-1 truncate ${props.overview.market.value.radar.level === 'red' ? 'text-down' : props.overview.market.value.radar.level === 'yellow' ? 'text-warn' : 'text-text-muted'}`} title={props.overview.market.value.radar.headline}><Activity className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{props.overview.market.value.radar.headline}</span></span>}
        </div>
      )}

      {props.menuOpen && (
        <div className="absolute right-2 top-9 z-20 w-44 rounded-md border border-border bg-bg-elevated p-1 shadow-lg" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { props.onQuickView(); props.onToggleMenu(); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bg-card"><Eye className="h-3.5 w-3.5" aria-hidden="true" />{t('openQuickView')}</button>
          <div className="my-1 border-t border-border" />
          <div className="px-2 py-1 text-[11px] font-semibold text-text-muted">{t('moveTo')}</div>
          {otherGroups.length === 0 && <div className="px-2 py-1 text-[11px] text-text-muted">{t('noOtherColumns')}</div>}
          {otherGroups.map((group) => <button type="button" key={group.id} onClick={() => { props.onMove(group.id); props.onToggleMenu(); }} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-bg-card">{t('moveToArrow', { name: group.name })}</button>)}
          <div className="my-1 border-t border-border" />
          <button type="button" onClick={() => { props.onRemove(); props.onToggleMenu(); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-status-bad hover:bg-status-bad/10"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{t('removeFromWatchlist')}</button>
        </div>
      )}
    </article>
  );
}
