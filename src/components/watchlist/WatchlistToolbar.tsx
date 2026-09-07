'use client';

import {
  AlertTriangle,
  Cloud,
  CloudOff,
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  useDismissableLayer(actionsRef, actionsOpen, () => setActionsOpen(false), { focusOnOpen: true, restoreFocus: true });
  const SyncIcon = SYNC_ICONS[props.syncStatus];
  const syncTone = props.syncStatus === 'conflict' || props.syncStatus === 'error'
    ? 'text-warn'
    : props.syncStatus === 'synced' ? 'text-status-good' : 'text-text-dim';

  return (
    <header className="relative mb-2 border-b border-border pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="h-5 w-1 rounded-full bg-accent sm:h-6" aria-hidden="true" />
            <h1 className="text-xl font-bold text-text sm:text-[22px]">{t('heading')}</h1>
            <span className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
              {props.count}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] sm:mt-1 sm:text-[11px]">
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

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="inline-flex shrink-0 rounded-md border border-border bg-bg-elevated p-0.5" role="group" aria-label={t('viewAriaLabel')}>
            <button type="button" onClick={() => props.onViewChange('table')} aria-pressed={props.view === 'table'} aria-label={t('viewTable')} title={t('viewTable')}
              className={`flex h-8 w-8 items-center justify-center gap-1.5 rounded text-xs transition sm:w-auto sm:px-2.5 ${props.view === 'table' ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-dim hover:text-text'}`}>
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">{t('viewTable')}</span>
            </button>
            <button type="button" onClick={() => props.onViewChange('kanban')} aria-pressed={props.view === 'kanban'} aria-label={t('viewKanban')} title={t('viewKanban')}
              className={`flex h-8 w-8 items-center justify-center gap-1.5 rounded text-xs transition sm:w-auto sm:px-2.5 ${props.view === 'kanban' ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-dim hover:text-text'}`}>
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">{t('viewKanban')}</span>
            </button>
          </div>
          <button type="button" onClick={props.onRefresh} disabled={props.count === 0 || props.quotesLoading}
            className="icon-button" title={t('refreshTitle')} aria-label={t('refreshTitle')}>
            <RefreshCw className={`h-4 w-4 ${props.quotesLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <div ref={actionsRef} className="relative shrink-0">
            <button type="button" onClick={() => setActionsOpen((open) => !open)} className="icon-button relative" aria-label={t('moreActions')} title={t('moreActions')} aria-expanded={actionsOpen}>
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              {(props.trashCount ?? 0) > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-warn px-1 text-[11px] font-bold leading-4 text-black">{props.trashCount}</span>}
            </button>
            {actionsOpen && <div data-dismissable-layer-content role="menu" aria-label={t('moreActions')} className="absolute right-0 top-full z-40 mt-1 w-48 rounded-md border border-border bg-bg-elevated p-1 shadow-xl">
              <button data-dismissable-layer-autofocus role="menuitem" type="button" onClick={() => { props.onImport(); setActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-text-dim hover:bg-bg-card hover:text-text"><Upload className="h-3.5 w-3.5" aria-hidden="true" />{t('importBatch')}</button>
              <button role="menuitem" type="button" onClick={() => { props.onExportCsv(); setActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-text-dim hover:bg-bg-card hover:text-text"><FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />{t('exportCsv')}</button>
              <button role="menuitem" type="button" onClick={() => { props.onExportYaml(); setActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-text-dim hover:bg-bg-card hover:text-text"><FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />{t('exportYaml')}</button>
              {props.onOpenTrash && <button role="menuitem" type="button" onClick={() => { props.onOpenTrash?.(); setActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-text-dim hover:bg-bg-card hover:text-text"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{t('trash.open')}{(props.trashCount ?? 0) > 0 && <span className="ml-auto font-mono text-warn">{props.trashCount}</span>}</button>}
            </div>}
          </div>
        </div>
      </div>
    </header>
  );
}
