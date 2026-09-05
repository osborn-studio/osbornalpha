'use client';

import {
  AlertTriangle,
  Cloud,
  CloudOff,
  ChevronDown,
  Download,
  FileCode2,
  FileSpreadsheet,
  LayoutGrid,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { WatchlistSyncStatus } from '@/lib/hooks/useWatchlist';
import type { WatchlistUiPreferencesSyncStatus } from '@/lib/hooks/useWatchlistUiPreferences';
import { useDismissableLayer } from '@/lib/hooks/useDismissableLayer';

interface Props {
  count: number;
  view: 'kanban' | 'table';
  syncStatus: WatchlistSyncStatus;
  quotesLoading: boolean;
  failedQuotes: number;
  overviewPartial?: boolean;
  overviewTotal?: number;
  overviewError?: boolean;
  onViewChange: (view: 'kanban' | 'table') => void;
  onRefresh: () => void;
  onImport: () => void;
  onExportYaml: () => void;
  onExportCsv: () => void;
  onOpenTrash?: () => void;
  trashCount?: number;
  preferencesSyncStatus?: WatchlistUiPreferencesSyncStatus;
  onRetryPreferencesSync?: () => void;
}

const SYNC_ICONS = {
  local: CloudOff,
  syncing: LoaderCircle,
  synced: Cloud,
  conflict: AlertTriangle,
  error: CloudOff,
};

export function WatchlistToolbar(props: Props) {
  const t = useTranslations('market.watchlist');
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  useDismissableLayer(exportRef, exportOpen, () => setExportOpen(false), { focusOnOpen: true, restoreFocus: true });
  useDismissableLayer(mobileActionsRef, mobileActionsOpen, () => setMobileActionsOpen(false), { focusOnOpen: true, restoreFocus: true });
  const SyncIcon = SYNC_ICONS[props.syncStatus];
  const syncTone = props.syncStatus === 'conflict' || props.syncStatus === 'error'
    ? 'text-warn'
    : props.syncStatus === 'synced' ? 'text-status-good' : 'text-text-dim';

  return (
    <header className="relative mb-3 border-b border-border pb-3 pt-0.5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-1 rounded-full bg-accent" aria-hidden="true" />
            <h1 className="text-[22px] font-bold text-text">{t('heading')}</h1>
            <span className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
              {props.count}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
            <span className={`inline-flex items-center gap-1.5 ${syncTone}`}>
              <SyncIcon className={`h-3.5 w-3.5 ${props.syncStatus === 'syncing' ? 'animate-spin' : ''}`} aria-hidden="true" />
              {t(`sync.${props.syncStatus}`)}
            </span>
            {props.preferencesSyncStatus === 'saving' && (
              <span className="inline-flex items-center gap-1.5 text-text-dim">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {t('uiSync.saving')}
              </span>
            )}
            {props.preferencesSyncStatus === 'conflict' && (
              <span className="inline-flex items-center gap-1.5 text-warn">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {t('uiSync.merging')}
              </span>
            )}
            {props.preferencesSyncStatus === 'error' && (
              <button type="button" onClick={props.onRetryPreferencesSync} className="inline-flex items-center gap-1.5 text-warn hover:text-text">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {t('uiSync.retry')}
              </button>
            )}
            {props.quotesLoading && <span className="text-text-dim">{t('loadingQuotes')}</span>}
            {!props.quotesLoading && props.failedQuotes > 0 && (
              <span className="text-status-bad">{t('quotesFailed', { count: props.failedQuotes })}</span>
            )}
            {props.overviewPartial && <span className="text-warn">{t('overviewPartial', { count: props.overviewTotal ?? props.count })}</span>}
            {props.overviewError && <span className="text-warn">{t('overviewUnavailable')}</span>}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 lg:overflow-visible lg:pb-0">
          <div className="inline-flex shrink-0 rounded-md border border-border bg-bg-elevated p-0.5" role="group" aria-label={t('viewAriaLabel')}>
            <button type="button" onClick={() => props.onViewChange('table')} aria-pressed={props.view === 'table'}
              className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-xs transition ${props.view === 'table' ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-dim hover:text-text'}`}>
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />{t('viewTable')}
            </button>
            <button type="button" onClick={() => props.onViewChange('kanban')} aria-pressed={props.view === 'kanban'}
              className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-xs transition ${props.view === 'kanban' ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-dim hover:text-text'}`}>
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />{t('viewKanban')}
            </button>
          </div>
          <button type="button" onClick={props.onRefresh} disabled={props.count === 0 || props.quotesLoading}
            className="icon-button hidden sm:inline-flex" title={t('refreshTitle')} aria-label={t('refreshTitle')}>
            <RefreshCw className={`h-4 w-4 ${props.quotesLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <div ref={exportRef} className="relative hidden shrink-0 sm:block">
            <button type="button" onClick={() => setExportOpen((open) => !open)} className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg-elevated px-2 text-xs text-text-dim hover:border-border-active hover:text-text" title={t('export')} aria-label={t('export')} aria-expanded={exportOpen}>
              <Download className="h-4 w-4" aria-hidden="true" /><ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {exportOpen && <div data-dismissable-layer-content role="menu" aria-label={t('export')} className="absolute right-0 top-full z-40 mt-1 w-40 rounded-md border border-border bg-bg-elevated p-1 shadow-xl"><button data-dismissable-layer-autofocus role="menuitem" type="button" onClick={() => { props.onExportCsv(); setExportOpen(false); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-bg-card"><FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />{t('exportCsv')}</button><button role="menuitem" type="button" onClick={() => { props.onExportYaml(); setExportOpen(false); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-bg-card"><FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />{t('exportYaml')}</button></div>}
          </div>
          <button type="button" onClick={props.onImport} title={t('importBatch')} aria-label={t('importBatch')}
            className="hidden h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 text-xs font-semibold text-text transition hover:border-border-active hover:bg-bg-card sm:inline-flex">
            <Upload className="h-4 w-4" aria-hidden="true" /><span>{t('importBatch')}</span>
          </button>
          {props.onOpenTrash && <button type="button" onClick={props.onOpenTrash} className="icon-button relative hidden sm:inline-flex" title={t('trash.open')} aria-label={t('trash.open')}><Trash2 className="h-4 w-4" aria-hidden="true" />{(props.trashCount ?? 0) > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-warn px-1 text-[11px] font-bold leading-4 text-black">{props.trashCount}</span>}</button>}
          <div ref={mobileActionsRef} className="relative shrink-0 sm:hidden">
            <button type="button" onClick={() => setMobileActionsOpen((open) => !open)} className="icon-button" aria-label={t('moreActions')} title={t('moreActions')} aria-expanded={mobileActionsOpen}>
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              {(props.trashCount ?? 0) > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-warn px-1 text-[11px] font-bold leading-4 text-black">{props.trashCount}</span>}
            </button>
            {mobileActionsOpen && <div data-dismissable-layer-content role="menu" aria-label={t('moreActions')} className="absolute right-0 top-full z-40 mt-1 w-48 rounded-md border border-border bg-bg-elevated p-1 shadow-xl">
              <button data-dismissable-layer-autofocus role="menuitem" type="button" disabled={props.count === 0 || props.quotesLoading} onClick={() => { props.onRefresh(); setMobileActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-text-dim hover:bg-bg-card hover:text-text disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{t('refreshTitle')}</button>
              <button role="menuitem" type="button" onClick={() => { props.onImport(); setMobileActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-text-dim hover:bg-bg-card hover:text-text"><Upload className="h-3.5 w-3.5" aria-hidden="true" />{t('importBatch')}</button>
              <button role="menuitem" type="button" onClick={() => { props.onExportCsv(); setMobileActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-text-dim hover:bg-bg-card hover:text-text"><FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />{t('exportCsv')}</button>
              <button role="menuitem" type="button" onClick={() => { props.onExportYaml(); setMobileActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-text-dim hover:bg-bg-card hover:text-text"><FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />{t('exportYaml')}</button>
              {props.onOpenTrash && <button role="menuitem" type="button" onClick={() => { props.onOpenTrash?.(); setMobileActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-text-dim hover:bg-bg-card hover:text-text"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{t('trash.open')}{(props.trashCount ?? 0) > 0 && <span className="ml-auto font-mono text-warn">{props.trashCount}</span>}</button>}
            </div>}
          </div>
        </div>
      </div>
    </header>
  );
}
