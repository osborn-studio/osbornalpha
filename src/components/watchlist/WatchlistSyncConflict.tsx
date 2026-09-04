'use client';

import { AlertTriangle, CloudDownload, CloudUpload, GitMerge } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function WatchlistSyncConflict({
  onUseServer,
  onKeepLocal,
  onMerge,
}: {
  onUseServer: () => void;
  onKeepLocal: () => void;
  onMerge: () => void;
}) {
  const t = useTranslations('market.watchlist.syncConflict');
  return (
    <div className="mb-3 flex flex-col gap-3 border-y border-warn/25 bg-warn/5 px-3 py-3 sm:flex-row sm:items-center" role="alert">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-text">{t('title')}</div>
        <div className="mt-0.5 text-[11px] text-text-dim">{t('body')}</div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onMerge} className="inline-flex h-8 items-center gap-1.5 rounded border border-accent/40 px-2.5 text-xs text-accent hover:bg-accent/10">
          <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />{t('merge')}
        </button>
        <button type="button" onClick={onUseServer} className="inline-flex h-8 items-center gap-1.5 rounded border border-border px-2.5 text-xs text-text-dim hover:text-text">
          <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />{t('useServer')}
        </button>
        <button type="button" onClick={onKeepLocal} className="inline-flex h-8 items-center gap-1.5 rounded bg-accent-dim px-2.5 text-xs font-semibold text-white">
          <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />{t('keepLocal')}
        </button>
      </div>
    </div>
  );
}
