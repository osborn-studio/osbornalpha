'use client';

import { Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDialogFocusTrap } from '@/lib/hooks/useDialogFocusTrap';

export type WatchlistPendingAction =
  | { kind: 'remove'; ticker: string }
  | { kind: 'bulk-remove'; tickers: string[] }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete'; id: string; name: string; count: number };

export function WatchlistActionDialog({
  action,
  onCancel,
  onConfirm,
}: {
  action: WatchlistPendingAction;
  onCancel: () => void;
  onConfirm: (value?: string) => void;
}) {
  const t = useTranslations('market.watchlist');
  const [name, setName] = useState(action.kind === 'rename' ? action.name : '');
  const ref = useDialogFocusTrap<HTMLDivElement>(onCancel);
  useEffect(() => { if (action.kind === 'rename') setName(action.name); }, [action]);
  const rename = action.kind === 'rename';
  const title = action.kind === 'remove'
    ? t('confirmRemove', { ticker: action.ticker })
    : action.kind === 'bulk-remove'
      ? t('confirmBulkRemove', { count: action.tickers.length })
    : action.kind === 'rename'
      ? t('renamePrompt', { name: action.name })
      : action.count > 0
        ? t('deleteConfirmWithStocks', { name: action.name, count: action.count })
        : t('deleteConfirmEmpty', { name: action.name });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]" onClick={onCancel}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="watchlist-action-title"
        className="w-full max-w-sm rounded-lg border border-border bg-bg p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${rename ? 'bg-accent/10 text-accent' : 'bg-down/10 text-down'}`}>
            {rename ? <Pencil className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="watchlist-action-title" className="text-sm font-semibold text-text">{title}</h2>
            {rename && <input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && name.trim()) onConfirm(name.trim()); }} className="mt-3 w-full text-sm" />}
          </div>
          <button type="button" onClick={onCancel} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" aria-label={t('cancel')}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-8 rounded border border-border px-3 text-xs text-text-dim">{t('cancel')}</button>
          <button type="button" onClick={() => onConfirm(rename ? name.trim() : undefined)} disabled={rename && !name.trim()}
            className={`h-8 rounded px-3 text-xs font-semibold text-white disabled:opacity-50 ${rename ? 'bg-accent-dim' : 'bg-down'}`}>
            {rename ? t('actionConfirm.rename') : t('actionConfirm.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
