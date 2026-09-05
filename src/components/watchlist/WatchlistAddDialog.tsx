'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDialogFocusTrap } from '@/lib/hooks/useDialogFocusTrap';
import type { WatchlistGroup } from '@/lib/watchlist/store';
import { WatchlistSecuritySearch, type WatchlistSecurityResult } from './WatchlistSecuritySearch';

export function WatchlistAddDialog({ groups, onAdd, onClose }: { groups: WatchlistGroup[]; onAdd: (security: WatchlistSecurityResult, groupId: string) => void; onClose: () => void }) {
  const t = useTranslations('market.watchlist.addDialog');
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const ref = useDialogFocusTrap<HTMLDivElement>(onClose);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="watchlist-add-title" className="w-full max-w-lg rounded-lg border border-border bg-bg p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"><Plus className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><h2 id="watchlist-add-title" className="text-base font-semibold text-text">{t('title')}</h2><p className="mt-0.5 text-xs text-text-muted">{t('subtitle')}</p></div>
          <button type="button" onClick={onClose} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent" aria-label={t('close')}><X className="h-4 w-4" aria-hidden="true" /></button>
        </header>
        <label className="mb-3 block"><span className="mb-1 block text-[11px] font-medium text-text-muted">{t('group')}</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="h-9 w-full text-sm">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <WatchlistSecuritySearch framed={false} onAdd={(security) => onAdd(security, groupId)} onClose={onClose} />
      </div>
    </div>
  );
}
