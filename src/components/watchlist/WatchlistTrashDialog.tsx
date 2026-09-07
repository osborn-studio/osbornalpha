'use client';

import { Clock3, RotateCcw, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VersionedWatchlistSnapshot } from '@/lib/watchlist/sync';
import type { WatchlistTrashEntry } from '@/lib/watchlist/trash';
import { useDialogFocusTrap } from '@/lib/hooks/useDialogFocusTrap';

export function WatchlistTrashDialog({ entries, loading, saving, error, onRestore, onDelete, onClose }: {
  entries: WatchlistTrashEntry[]; loading: boolean; saving: boolean; error: string | null;
  onRestore: (entry: WatchlistTrashEntry) => Promise<VersionedWatchlistSnapshot | null>;
  onDelete: (entry: WatchlistTrashEntry) => Promise<boolean>; onClose: () => void;
}) {
  const t = useTranslations('market.watchlist.trash');
  const ref = useDialogFocusTrap<HTMLElement>(onClose);
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} className="w-full max-w-lg rounded-lg border border-border bg-bg-elevated shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="watchlist-trash-title">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3"><Trash2 className="h-4 w-4 text-warn" aria-hidden="true" /><h2 id="watchlist-trash-title" className="min-w-0 flex-1 text-sm font-semibold text-text">{t('title')}</h2><button type="button" onClick={onClose} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent" aria-label={t('close')} title={t('close')}><X className="h-4 w-4" aria-hidden="true" /></button></header>
      <div className="max-h-[60vh] overflow-y-auto p-4">{loading ? <div className="h-20 animate-pulse rounded bg-bg-card" role="status" /> : entries.length === 0 ? <p className="py-8 text-center text-xs text-text-muted">{t('empty')}</p> : <div className="divide-y divide-border/70">{entries.map((entry) => <div key={entry.id} className="flex items-center gap-3 py-3"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text">{entry.label}</span><span className="mt-1 flex items-center gap-1 text-[10px] text-text-muted"><Clock3 className="h-3 w-3" aria-hidden="true" />{t('expires', { date: new Date(entry.expires_at).toLocaleDateString() })}</span></span><button type="button" disabled={saving} onClick={() => void onRestore(entry)} className="icon-button !h-8 !w-8 !basis-8" title={t('restore')} aria-label={t('restore')}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /></button><button type="button" disabled={saving} onClick={() => { if (window.confirm(t('deleteConfirm'))) void onDelete(entry); }} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent text-text-muted hover:text-status-bad" title={t('delete')} aria-label={t('delete')}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button></div>)}</div>}{error && <p className="mt-3 text-xs text-status-bad" role="alert">{t('error')}</p>}</div>
    </section>
  </div>;
}
