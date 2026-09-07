'use client';

import { Columns2, Minus, MoveRight, Plus, Tag, Trash2, Workflow, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { WatchlistMarketGroup } from '@/lib/watchlist/market-row';
import { WATCHLIST_BULK_WORKFLOW_LIMIT } from '@/lib/watchlist/bulk-workflow';

export function WatchlistTableBulkActions({
  selected,
  groups,
  onMoveTickers,
  onRemoveTickers,
  onTagTickers,
  onCompare,
  onWorkflow,
  onClear,
}: {
  selected: ReadonlySet<string>;
  groups: WatchlistMarketGroup[];
  onMoveTickers?: (tickers: string[], groupId: string) => void;
  onRemoveTickers?: (tickers: string[]) => void;
  onTagTickers?: (tickers: string[], tag: string, mode: 'add' | 'remove') => Promise<boolean>;
  onCompare?: (tickers: string[]) => void;
  onWorkflow?: (tickers: string[]) => void;
  onClear: () => void;
}) {
  const t = useTranslations('market.table');
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [tag, setTag] = useState('');
  const [tagSaving, setTagSaving] = useState(false);

  useEffect(() => {
    if (!groups.some((group) => group.id === groupId)) setGroupId(groups[0]?.id ?? '');
  }, [groupId, groups]);

  if (selected.size === 0) return null;
  const tickers = [...selected];
  const updateTags = async (mode: 'add' | 'remove') => {
    const normalizedTag = tag.trim();
    if (!normalizedTag || !onTagTickers) return;
    setTagSaving(true);
    try {
      const updated = await onTagTickers(tickers, normalizedTag, mode);
      if (updated) {
        setTag('');
        onClear();
      }
    } finally {
      setTagSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-accent/20 bg-accent/5 px-3 py-2">
      <span className="mr-auto text-xs font-semibold text-text">{t('selection.count', { count: selected.size })}</span>
      <div className="flex min-w-[190px] items-center gap-1">
        <Tag className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        <input value={tag} maxLength={32} onChange={(event) => setTag(event.target.value)} placeholder={t('selection.tagPlaceholder')} aria-label={t('selection.tagPlaceholder')} className="h-8 min-w-0 flex-1 py-1 text-xs" />
        <button type="button" disabled={!tag.trim() || tagSaving || !onTagTickers} onClick={() => void updateTags('add')} className="icon-button !h-8 !w-8 !basis-8" title={t('selection.addTag')} aria-label={t('selection.addTag')}><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
        <button type="button" disabled={!tag.trim() || tagSaving || !onTagTickers} onClick={() => void updateTags('remove')} className="icon-button !h-8 !w-8 !basis-8" title={t('selection.removeTag')} aria-label={t('selection.removeTag')}><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </div>
      <select value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label={t('selection.targetGroup')} className="h-8 py-1 text-xs">
        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
      <button type="button" disabled={!groupId || !onMoveTickers} onClick={() => { onMoveTickers?.(tickers, groupId); onClear(); }} className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-bg-elevated px-2.5 text-xs text-text disabled:opacity-50"><MoveRight className="h-3.5 w-3.5" aria-hidden="true" />{t('selection.move')}</button>
      <button type="button" disabled={!onRemoveTickers} onClick={() => { onRemoveTickers?.(tickers); onClear(); }} className="inline-flex h-8 items-center gap-1.5 rounded border border-status-bad/30 px-2.5 text-xs text-status-bad disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{t('selection.remove')}</button>
      {onWorkflow && <button type="button" disabled={selected.size > WATCHLIST_BULK_WORKFLOW_LIMIT} onClick={() => { onWorkflow(tickers); onClear(); }} title={selected.size > WATCHLIST_BULK_WORKFLOW_LIMIT ? t('selection.workflowLimit', { count: WATCHLIST_BULK_WORKFLOW_LIMIT }) : t('selection.workflow')} className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-bg-elevated px-2.5 text-xs text-text disabled:opacity-50"><Workflow className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{t('selection.workflow')}</button>}
      {onCompare && <button type="button" disabled={selected.size < 2 || selected.size > 5} onClick={() => { onCompare(tickers); onClear(); }} title={selected.size > 5 ? t('selection.compareLimit') : t('selection.compare')} className="inline-flex h-8 items-center gap-1.5 rounded border border-accent/30 bg-accent/10 px-2.5 text-xs font-medium text-accent disabled:border-border disabled:bg-transparent disabled:text-text-muted disabled:opacity-60"><Columns2 className="h-3.5 w-3.5" aria-hidden="true" />{t('selection.compare')}</button>}
      <button type="button" onClick={onClear} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent" aria-label={t('selection.clear')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
    </div>
  );
}
