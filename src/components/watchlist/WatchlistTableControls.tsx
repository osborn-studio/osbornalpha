'use client';

import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkPlus,
  Check,
  Columns3,
  Filter,
  ListChecks,
  Pin,
  PinOff,
  Pencil,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import type { Market } from '@/lib/supabase/database.types';
import type { QuoteDisplayStatus, WatchlistMarketGroup, WatchlistMarketRow } from '@/lib/watchlist/market-row';
import {
  WATCHLIST_METRIC_FILTERS,
  type WatchlistColumnKey,
  type WatchlistMetricFilterKey,
  type WatchlistSavedTableView,
  type WatchlistTablePreferences,
  type WatchlistTablePreset,
} from '@/lib/watchlist/ui-preferences';
import {
  WATCHLIST_COLUMN_GROUPS,
  WATCHLIST_TABLE_COLUMNS,
  WATCHLIST_TABLE_PRESETS,
  WATCHLIST_TABLE_PRESET_KEYS,
} from './WatchlistTableConfig';
import { useDismissableLayer } from '@/lib/hooks/useDismissableLayer';
import { watchlistMetricRequiresSingleMarket } from '@/lib/watchlist/metric-registry';
import {
  resetWatchlistTableFilters,
  moveWatchlistSavedView,
  renameWatchlistSavedView,
  setDefaultWatchlistSavedView,
  watchlistNumericInput,
  watchlistTableActiveFilterCount,
} from '@/lib/watchlist/table-model';

export function WatchlistTableControls({
  groups,
  rows,
  preferences,
  savedViews,
  setPreferences,
  setSavedViews,
  onAddSecurity,
  mobileSelectionMode = false,
  onMobileSelectionModeChange,
}: {
  groups: WatchlistMarketGroup[];
  rows: WatchlistMarketRow[];
  preferences: WatchlistTablePreferences;
  savedViews: WatchlistSavedTableView[];
  setPreferences: Dispatch<SetStateAction<WatchlistTablePreferences>>;
  setSavedViews: Dispatch<SetStateAction<WatchlistSavedTableView[]>>;
  onAddSecurity?: () => void;
  mobileSelectionMode?: boolean;
  onMobileSelectionModeChange?: (active: boolean) => void;
}) {
  const t = useTranslations('market.table');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editingViewName, setEditingViewName] = useState('');
  const appliedDefaultView = useRef<string | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const viewsRef = useRef<HTMLDivElement>(null);
  useDismissableLayer(columnsRef, columnsOpen, () => setColumnsOpen(false), { focusOnOpen: true, restoreFocus: true });
  useDismissableLayer(filtersRef, filtersOpen, () => setFiltersOpen(false), { focusOnOpen: true, restoreFocus: true });
  useDismissableLayer(viewsRef, viewsOpen, () => setViewsOpen(false), { focusOnOpen: true, restoreFocus: true });

  useEffect(() => {
    const defaultView = savedViews.find((view) => view.isDefault);
    if (!defaultView || appliedDefaultView.current === defaultView.id) return;
    appliedDefaultView.current = defaultView.id;
    setPreferences({
      ...defaultView.preferences,
      visibleColumns: [...defaultView.preferences.visibleColumns],
      columnWidths: { ...defaultView.preferences.columnWidths },
      pinnedColumns: [...defaultView.preferences.pinnedColumns],
    });
  }, [savedViews, setPreferences]);

  const {
    preset, visibleColumns, query, groupFilter, marketFilter, statusFilter,
    decisionFilter, tagFilter, historyRange, metricFilter, metricMin, metricMax,
    density, pinnedColumns,
  } = preferences;
  const markets = Array.from(new Set(rows.map((row) => row.market)));
  const activeFilterCount = watchlistTableActiveFilterCount(preferences);
  const resetFilters = () => setPreferences(resetWatchlistTableFilters);
  const applyPreset = (next: WatchlistTablePreset) => setPreferences((current) => ({
    ...current,
    preset: next,
    visibleColumns: WATCHLIST_TABLE_PRESETS[next],
  }));
  const saveCurrentView = () => {
    const name = viewName.trim().slice(0, 40);
    if (!name) return;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    setSavedViews((current) => {
      const normalizedName = name.toLocaleLowerCase();
      const existing = current.find((view) => view.name.toLocaleLowerCase() === normalizedName);
      return [{
        id,
        name,
        preferences: { ...preferences, visibleColumns: [...preferences.visibleColumns] },
        ...(existing?.isDefault ? { isDefault: true } : {}),
      }, ...current.filter((view) => view.name.toLocaleLowerCase() !== normalizedName)].slice(0, 12);
    });
    setViewName('');
  };
  const loadSavedView = (view: WatchlistSavedTableView) => {
    setPreferences({ ...view.preferences, visibleColumns: [...view.preferences.visibleColumns] });
    setViewsOpen(false);
  };
  const startRenamingView = (view: WatchlistSavedTableView) => {
    setEditingViewId(view.id);
    setEditingViewName(view.name);
  };
  const finishRenamingView = () => {
    if (editingViewId) setSavedViews((current) => renameWatchlistSavedView(current, editingViewId, editingViewName));
    setEditingViewId(null);
    setEditingViewName('');
  };
  const toggleColumn = (column: WatchlistColumnKey) => {
    if ((column === 'ticker' || column === 'name') && visibleColumns.includes(column)) return;
    const next = visibleColumns.includes(column)
      ? visibleColumns.filter((item) => item !== column)
      : WATCHLIST_TABLE_COLUMNS.filter((item) => visibleColumns.includes(item) || item === column);
    setPreferences((current) => ({
      ...current,
      visibleColumns: next,
      pinnedColumns: current.pinnedColumns.filter((item) => next.includes(item)),
    }));
  };
  const togglePinned = (column: WatchlistColumnKey) => setPreferences((current) => {
    if (column === 'ticker') return current;
    const pinned = current.pinnedColumns.includes(column)
      ? current.pinnedColumns.filter((item) => item !== column)
      : [...current.pinnedColumns, column].slice(-3);
    const nextPinned = pinned.includes('ticker')
      ? pinned
      : (['ticker', ...pinned] as WatchlistColumnKey[]).slice(0, 3);
    return { ...current, pinnedColumns: nextPinned };
  });
  const moveColumn = (column: WatchlistColumnKey, offset: -1 | 1) => {
    const index = visibleColumns.indexOf(column);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= visibleColumns.length) return;
    const next = [...visibleColumns];
    [next[index], next[target]] = [next[target], next[index]];
    setPreferences((current) => ({ ...current, visibleColumns: next }));
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-bg-elevated/70 px-3 py-2 xl:flex-row xl:items-center">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_36px] gap-2 sm:flex sm:items-center">
        <div className="col-span-2 inline-flex w-fit max-w-full shrink-0 overflow-x-auto rounded-md border border-border bg-bg p-0.5 text-xs sm:col-span-1" role="group" aria-label={t('presetAriaLabel')}>
          {WATCHLIST_TABLE_PRESET_KEYS.map((item) => (
            <button key={item} type="button" onClick={() => applyPreset(item)} aria-pressed={preset === item} className={`shrink-0 rounded px-2.5 py-1.5 transition sm:px-3 ${preset === item ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-dim hover:text-text'}`}>
              {t(`presets.${item}`)}
            </button>
          ))}
        </div>
        <div className="relative w-full min-w-0 sm:w-[260px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input value={query} onChange={(event) => setPreferences((current) => ({ ...current, query: event.target.value }))} placeholder={t('filters.search')} aria-label={t('filters.search')} className="w-full bg-bg py-1.5 pl-7 pr-2.5 text-xs" />
        </div>
        {onAddSecurity && <button type="button" onClick={onAddSecurity} aria-label={t('addSecurity')} title={t('addSecurity')} className="inline-flex h-8 w-9 shrink-0 items-center justify-center gap-1.5 rounded bg-accent-dim text-xs font-semibold text-white shadow-sm hover:brightness-110 sm:w-fit sm:px-3"><Plus className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">{t('addSecurity')}</span></button>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 pb-0.5 sm:flex-nowrap sm:overflow-x-auto xl:ml-auto xl:overflow-visible xl:pb-0">
        <select value={groupFilter} onChange={(event) => setPreferences((current) => ({ ...current, groupFilter: event.target.value }))} aria-label={t('filters.group')} className="hidden px-2 py-1.5 text-xs sm:block">
          <option value="all">{t('filters.allGroups')}</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <select value={marketFilter} onChange={(event) => setPreferences((current) => ({ ...current, marketFilter: event.target.value as 'all' | Market }))} aria-label={t('filters.market')} className="hidden px-2 py-1.5 text-xs sm:block">
          <option value="all">{t('filters.allMarkets')}</option>
          {markets.map((market) => <option key={market} value={market}>{market}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setPreferences((current) => ({ ...current, statusFilter: event.target.value as 'all' | QuoteDisplayStatus }))} aria-label={t('filters.status')} className="hidden px-2 py-1.5 text-xs sm:block">
          <option value="all">{t('filters.allStatuses')}</option>
          {(['live', 'delayed', 'stale', 'unavailable'] as QuoteDisplayStatus[]).map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
        </select>
        <div ref={filtersRef} className="relative shrink-0">
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className={`relative inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-bg-card text-xs text-text-dim ${activeFilterCount > 0 ? 'border-accent/40 text-accent' : ''}`} title={t('filters.advanced')} aria-label={t('filters.advanced')}>
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-[11px] font-bold leading-4 text-white">{activeFilterCount}</span>}
          </button>
          {filtersOpen && <div data-dismissable-layer-content role="dialog" aria-label={t('filters.advanced')} className="fixed inset-x-3 bottom-[72px] z-50 max-h-[72vh] overflow-y-auto rounded-md border border-border bg-bg-elevated p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:z-30 sm:mt-1 sm:w-[min(92vw,360px)] sm:shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3"><div className="text-xs font-semibold text-text">{t('filters.advanced')}</div><div className="flex items-center gap-2"><button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text"><RotateCcw className="h-3 w-3" aria-hidden="true" />{t('filters.reset')}</button><button data-dismissable-layer-autofocus type="button" onClick={() => setFiltersOpen(false)} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" aria-label={t('filters.close')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button></div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sm:hidden"><span className="mb-1 block text-[11px] text-text-muted">{t('filters.group')}</span><select value={groupFilter} onChange={(event) => setPreferences((current) => ({ ...current, groupFilter: event.target.value }))} className="h-9 w-full text-xs"><option value="all">{t('filters.allGroups')}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              <label className="sm:hidden"><span className="mb-1 block text-[11px] text-text-muted">{t('filters.market')}</span><select value={marketFilter} onChange={(event) => setPreferences((current) => ({ ...current, marketFilter: event.target.value as 'all' | Market }))} className="h-9 w-full text-xs"><option value="all">{t('filters.allMarkets')}</option>{markets.map((market) => <option key={market} value={market}>{market}</option>)}</select></label>
              <label className="sm:hidden"><span className="mb-1 block text-[11px] text-text-muted">{t('filters.status')}</span><select value={statusFilter} onChange={(event) => setPreferences((current) => ({ ...current, statusFilter: event.target.value as 'all' | QuoteDisplayStatus }))} className="h-9 w-full text-xs"><option value="all">{t('filters.allStatuses')}</option>{(['live', 'delayed', 'stale', 'unavailable'] as QuoteDisplayStatus[]).map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}</select></label>
              <label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.decision')}</span><select value={decisionFilter} onChange={(event) => setPreferences((current) => ({ ...current, decisionFilter: event.target.value as WatchlistTablePreferences['decisionFilter'] }))} className="h-9 w-full text-xs"><option value="all">{t('filters.allDecisions')}</option>{(['inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated'] as const).map((status) => <option key={status} value={status}>{t(`decisionStatuses.${status}`)}</option>)}</select></label>
              <label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.tag')}</span><input value={tagFilter} maxLength={32} onChange={(event) => setPreferences((current) => ({ ...current, tagFilter: event.target.value }))} placeholder={t('filters.tagPlaceholder')} className="h-9 w-full text-xs" /></label>
              <label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.metric')}</span><select value={metricFilter} onChange={(event) => { const value = event.target.value as 'none' | WatchlistMetricFilterKey; setPreferences((current) => ({ ...current, metricFilter: value, metricMin: value === 'none' ? null : current.metricMin, metricMax: value === 'none' ? null : current.metricMax })); }} className="h-9 w-full text-xs"><option value="none">{t('filters.noMetric')}</option>{WATCHLIST_METRIC_FILTERS.map((metric) => { const restricted = marketFilter === 'all' && watchlistMetricRequiresSingleMarket(metric); return <option key={metric} value={metric} disabled={restricted}>{t(`headers.${metric}`)}{restricted ? ` · ${t('filters.singleMarketRequired')}` : ''}</option>; })}</select></label>
              <label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.historyRange')}</span><select value={historyRange} onChange={(event) => setPreferences((current) => ({ ...current, historyRange: event.target.value as WatchlistTablePreferences['historyRange'] }))} disabled={metricFilter === 'none'} className="h-9 w-full text-xs disabled:opacity-50">{(['1m', '6m', 'ytd', '1y', '5y', 'all'] as const).map((range) => <option key={range} value={range}>{t(`filters.ranges.${range}`)}</option>)}</select></label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3"><label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.minimum')}</span><input type="number" step="any" value={metricMin ?? ''} onChange={(event) => { const value = watchlistNumericInput(event.target.value); setPreferences((current) => ({ ...current, metricMin: value, metricMax: value != null && current.metricMax != null && value > current.metricMax ? null : current.metricMax })); }} disabled={metricFilter === 'none'} className="h-9 w-full text-xs disabled:opacity-50" /></label><label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.maximum')}</span><input type="number" step="any" value={metricMax ?? ''} onChange={(event) => { const value = watchlistNumericInput(event.target.value); setPreferences((current) => ({ ...current, metricMax: value, metricMin: value != null && current.metricMin != null && value < current.metricMin ? null : current.metricMin })); }} disabled={metricFilter === 'none'} className="h-9 w-full text-xs disabled:opacity-50" /></label></div>
          </div>}
        </div>
        <div ref={viewsRef} className="relative shrink-0">
          <button type="button" onClick={() => setViewsOpen((open) => !open)} aria-expanded={viewsOpen} className="icon-button !h-8 !w-8 !basis-8" title={t('views.action')} aria-label={t('views.action')}><Bookmark className="h-3.5 w-3.5" aria-hidden="true" /></button>
          {viewsOpen && <div data-dismissable-layer-content role="dialog" aria-label={t('views.action')} className="absolute right-0 top-full z-30 mt-1 w-[min(92vw,340px)] rounded-md border border-border bg-bg-elevated p-2 shadow-xl">
            <form className="flex items-center gap-1.5" onSubmit={(event) => { event.preventDefault(); saveCurrentView(); }}><input data-dismissable-layer-autofocus value={viewName} maxLength={40} onChange={(event) => setViewName(event.target.value)} placeholder={t('views.namePlaceholder')} aria-label={t('views.namePlaceholder')} className="h-8 min-w-0 flex-1 px-2 text-xs" /><button type="submit" disabled={!viewName.trim()} className="icon-button !h-8 !w-8 !basis-8" title={t('views.save')} aria-label={t('views.save')}><BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" /></button></form>
            <div className="mt-2 border-t border-border pt-1">{savedViews.length === 0 ? <div className="px-1 py-2 text-[11px] text-text-muted">{t('views.empty')}</div> : savedViews.map((view, index) => <div key={view.id} role="group" aria-label={view.name} className="flex items-center gap-0.5 rounded px-1 py-1 hover:bg-bg-card">{editingViewId === view.id ? <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(event) => { event.preventDefault(); finishRenamingView(); }}><input autoFocus value={editingViewName} maxLength={40} onChange={(event) => setEditingViewName(event.target.value)} className="h-7 min-w-0 flex-1 px-2 py-1 text-xs" aria-label={t('views.rename')} /><button type="submit" className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t('views.renameSave')}><Check className="h-3 w-3" aria-hidden="true" /></button><button type="button" onClick={() => setEditingViewId(null)} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t('views.renameCancel')}><X className="h-3 w-3" aria-hidden="true" /></button></form> : <><button type="button" onClick={() => loadSavedView(view)} className="min-w-0 flex-1 truncate text-left text-xs text-text-dim hover:text-text">{view.name}</button><button type="button" onClick={() => setSavedViews((current) => setDefaultWatchlistSavedView(current, view.id))} className={`icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent ${view.isDefault ? 'text-accent' : ''}`} title={t(view.isDefault ? 'views.unsetDefault' : 'views.setDefault')} aria-label={t(view.isDefault ? 'views.unsetDefault' : 'views.setDefault')}><Star className="h-3 w-3" fill={view.isDefault ? 'currentColor' : 'none'} aria-hidden="true" /></button><button type="button" onClick={() => startRenamingView(view)} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" title={t('views.rename')} aria-label={t('views.rename')}><Pencil className="h-3 w-3" aria-hidden="true" /></button><button type="button" disabled={index === 0} onClick={() => setSavedViews((current) => moveWatchlistSavedView(current, view.id, -1))} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" title={t('views.moveUp')} aria-label={t('views.moveUp')}><ArrowUp className="h-3 w-3" aria-hidden="true" /></button><button type="button" disabled={index === savedViews.length - 1} onClick={() => setSavedViews((current) => moveWatchlistSavedView(current, view.id, 1))} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" title={t('views.moveDown')} aria-label={t('views.moveDown')}><ArrowDown className="h-3 w-3" aria-hidden="true" /></button><button type="button" onClick={() => setSavedViews((current) => current.filter((item) => item.id !== view.id))} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" title={t('views.delete')} aria-label={t('views.delete')}><Trash2 className="h-3 w-3" aria-hidden="true" /></button></>}</div>)}</div>
          </div>}
        </div>
        {onMobileSelectionModeChange && <button type="button" onClick={() => onMobileSelectionModeChange(!mobileSelectionMode)} aria-pressed={mobileSelectionMode} className={`icon-button !h-8 !w-8 !basis-8 sm:hidden ${mobileSelectionMode ? 'border-accent/50 bg-accent/10 text-accent' : ''}`} title={t(mobileSelectionMode ? 'selection.exit' : 'selection.enter')} aria-label={t(mobileSelectionMode ? 'selection.exit' : 'selection.enter')}><ListChecks className="h-3.5 w-3.5" aria-hidden="true" /></button>}
        <button type="button" onClick={() => setPreferences((current) => ({ ...current, density: current.density === 'compact' ? 'comfortable' : 'compact' }))} className="icon-button !hidden !h-8 !w-8 !basis-8 sm:!inline-flex" title={t(`density.${density}`)} aria-label={t(`density.${density}`)}><Rows3 className="h-3.5 w-3.5" aria-hidden="true" /></button>
        <div ref={columnsRef} className="relative ml-auto hidden shrink-0 sm:block">
          <button type="button" onClick={() => setColumnsOpen((open) => !open)} aria-expanded={columnsOpen} className="icon-button !h-8 !w-8 !basis-8" title={t('columns.action')} aria-label={t('columns.action')}><Columns3 className="h-3.5 w-3.5" aria-hidden="true" /></button>
          {columnsOpen && <div data-dismissable-layer-content role="dialog" aria-label={t('columns.action')} className="absolute right-0 top-full z-30 mt-1 max-h-[min(70vh,640px)] w-72 overflow-y-auto rounded-md border border-border bg-bg-elevated p-2 shadow-xl">
            {WATCHLIST_COLUMN_GROUPS.map((group, groupIndex) => <div key={group.key} className={groupIndex === 0 ? '' : 'mt-2 border-t border-border pt-2'}><div className="px-2 pb-1 text-[11px] font-semibold text-text-muted">{t(`columns.groups.${group.key}`)}</div>{group.columns.map((column) => <div key={column} className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-bg-card"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 py-1"><input type="checkbox" checked={visibleColumns.includes(column)} disabled={(column === 'ticker' || column === 'name') && visibleColumns.includes(column)} onChange={() => toggleColumn(column)} /><span className="truncate">{t(`headers.${column}`)}</span></label>{visibleColumns.includes(column) && <><button type="button" onClick={() => togglePinned(column)} disabled={column === 'ticker' || (!pinnedColumns.includes(column) && pinnedColumns.length >= 3)} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t(pinnedColumns.includes(column) ? 'columns.unpin' : 'columns.pin', { label: t(`headers.${column}`) })}>{pinnedColumns.includes(column) ? <PinOff className="h-3 w-3" aria-hidden="true" /> : <Pin className="h-3 w-3" aria-hidden="true" />}</button><button type="button" onClick={() => moveColumn(column, -1)} disabled={visibleColumns[0] === column} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t('columns.moveUp', { label: t(`headers.${column}`) })}><ArrowUp className="h-3 w-3" aria-hidden="true" /></button><button type="button" onClick={() => moveColumn(column, 1)} disabled={visibleColumns.at(-1) === column} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t('columns.moveDown', { label: t(`headers.${column}`) })}><ArrowDown className="h-3 w-3" aria-hidden="true" /></button></>}</div>)}</div>)}
            <button type="button" onClick={() => setPreferences((current) => ({ ...current, columnWidths: {}, pinnedColumns: ['ticker', 'name'].filter((column) => current.visibleColumns.includes(column as WatchlistColumnKey)) as WatchlistColumnKey[] }))} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded border border-border text-[11px] text-text-muted hover:text-text"><RotateCcw className="h-3 w-3" aria-hidden="true" />{t('columns.resetLayout')}</button>
          </div>}
        </div>
      </div>
    </div>
  );
}
