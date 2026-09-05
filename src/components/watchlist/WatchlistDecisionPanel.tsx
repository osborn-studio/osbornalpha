'use client';

import { CircleHelp, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { WatchlistRequestError, watchlistJsonRequest } from '@/lib/watchlist/api-client';
import type { WatchlistOverviewItemRow } from '@/lib/watchlist/overview-contract';
import { WatchlistDecisionHistory } from './WatchlistDecisionHistory';

function normalizeTags(value: string) {
  return Array.from(new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))).slice(0, 20);
}

export function WatchlistDecisionPanel({
  item,
  currency,
  onSaved,
  onDirtyChange,
}: {
  item: WatchlistOverviewItemRow;
  currency?: string | null;
  onSaved: (item: WatchlistOverviewItemRow) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations('market.table.drawer.decision');
  const [thesis, setThesis] = useState(item.thesis ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [targetPrice, setTargetPrice] = useState(item.target_price?.toString() ?? '');
  const [invalidation, setInvalidation] = useState(item.invalidation_conditions ?? '');
  const [confidence, setConfidence] = useState(item.confidence ?? 50);
  const [conviction, setConviction] = useState(item.conviction ?? 5);
  const [reviewAt, setReviewAt] = useState(item.review_at?.slice(0, 10) ?? '');
  const [tags, setTags] = useState(item.tags.join(', '));
  const [status, setStatus] = useState(item.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictItem, setConflictItem] = useState<WatchlistOverviewItemRow | null>(null);

  const reset = (next: WatchlistOverviewItemRow = item) => {
    setThesis(next.thesis ?? '');
    setNotes(next.notes ?? '');
    setTargetPrice(next.target_price?.toString() ?? '');
    setInvalidation(next.invalidation_conditions ?? '');
    setConfidence(next.confidence ?? 50);
    setConviction(next.conviction ?? 5);
    setReviewAt(next.review_at?.slice(0, 10) ?? '');
    setTags(next.tags.join(', '));
    setStatus(next.status);
    setError(null);
    setConflictItem(null);
  };

  useEffect(() => {
    reset(item);
    // Reset only when the canonical row version changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.decision_version]);

  const normalizedTags = useMemo(() => normalizeTags(tags), [tags]);
  const validTarget = targetPrice === '' || (Number.isFinite(Number(targetPrice)) && Number(targetPrice) > 0);
  const dirty = thesis.trim() !== (item.thesis ?? '')
    || notes.trim() !== (item.notes ?? '')
    || (targetPrice === '' ? null : Number(targetPrice)) !== item.target_price
    || invalidation.trim() !== (item.invalidation_conditions ?? '')
    || confidence !== (item.confidence ?? 50)
    || conviction !== item.conviction
    || (reviewAt || null) !== (item.review_at?.slice(0, 10) ?? null)
    || JSON.stringify(normalizedTags) !== JSON.stringify(item.tags)
    || status !== item.status;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  async function save() {
    if (!dirty || !validTarget) return;
    setSaving(true);
    setError(null);
    setConflictItem(null);
    try {
      const body = await watchlistJsonRequest<{ item: WatchlistOverviewItemRow }>(`/api/watchlist/items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          thesis,
          notes,
          targetPrice: targetPrice ? Number(targetPrice) : null,
          invalidationConditions: invalidation,
          confidence,
          conviction,
          reviewAt: reviewAt || null,
          tags: normalizedTags,
          status,
          expectedVersion: item.decision_version,
        }),
      }, 'save_failed');
      if (!body.item) throw new Error('save_failed');
      onSaved(body.item);
    } catch (caught) {
      const conflict = caught instanceof WatchlistRequestError && caught.status === 409;
      if (conflict) {
        const currentItem = caught.body?.currentItem;
        setConflictItem(currentItem && typeof currentItem === 'object' ? currentItem as WatchlistOverviewItemRow : null);
      }
      setError(conflict ? t('conflict') : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-t border-border pt-4" aria-label={t('title')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-text">{t('title')}</h3>
        <select value={status} onChange={(event) => setStatus(event.target.value as WatchlistOverviewItemRow['status'])} className="h-8 py-1 text-xs" aria-label={t('status')}>
          {(['inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated'] as const).map((value) => (
            <option key={value} value={value}>{t(`statuses.${value}`)}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[11px] text-text-dim">{t('thesis')}</span>
          <textarea value={thesis} onChange={(event) => setThesis(event.target.value)} rows={3} maxLength={4000} className="w-full resize-y rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[11px] text-text-dim">{t('notes')}</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={2000} className="w-full resize-y rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>
        <label>
          <span className="mb-1 block text-[11px] text-text-dim">{currency ? t('targetPriceWithCurrency', { currency }) : t('targetPrice')}</span>
          <input type="number" min="0" step="any" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} className="w-full" aria-invalid={!validTarget} />
          {!validTarget && <span className="mt-1 block text-[11px] text-status-bad">{t('targetInvalid')}</span>}
        </label>
        <label>
          <span className="mb-1 block text-[11px] text-text-dim">{t('reviewAt')}</span>
          <input type="date" value={reviewAt} onChange={(event) => setReviewAt(event.target.value)} className="w-full" />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[11px] text-text-dim">{t('tags')}</span>
          <input value={tags} onChange={(event) => setTags(event.target.value)} className="w-full" placeholder={t('tagsPlaceholder')} />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[11px] text-text-dim">{t('invalidation')}</span>
          <textarea value={invalidation} onChange={(event) => setInvalidation(event.target.value)} rows={2} maxLength={2000} className="w-full resize-y rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>
        <label>
          <span className="mb-1 flex justify-between text-[11px] text-text-dim"><span className="inline-flex items-center gap-1" title={t('convictionHelp')}>{t('conviction')}<CircleHelp className="h-3 w-3 text-text-muted" aria-hidden="true" /></span><span className="font-mono text-text">{conviction}/10</span></span>
          <input type="range" min="0" max="10" step="1" value={conviction} onChange={(event) => setConviction(Number(event.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
        <label>
          <span className="mb-1 flex justify-between text-[11px] text-text-dim"><span className="inline-flex items-center gap-1" title={t('confidenceHelp')}>{t('confidence')}<CircleHelp className="h-3 w-3 text-text-muted" aria-hidden="true" /></span><span className="font-mono text-text">{confidence}%</span></span>
          <input type="range" min="0" max="100" step="5" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {error && <span className="mr-auto text-[11px] text-status-bad" role="alert">{error}</span>}
        {conflictItem && <button type="button" onClick={() => onSaved(conflictItem)} className="h-8 rounded border border-warn/30 px-2.5 text-xs text-warn">{t('conflictReload')}</button>}
        <button type="button" onClick={() => reset()} disabled={!dirty || saving} className="inline-flex h-8 items-center gap-1.5 rounded border border-border px-2.5 text-xs text-text-dim disabled:opacity-40">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{t('reset')}
        </button>
        <button type="button" onClick={() => void save()} disabled={saving || !dirty || !validTarget}
          className="inline-flex h-8 items-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50">
          <Save className="h-3.5 w-3.5" aria-hidden="true" />{saving ? t('saving') : t('save')}
        </button>
      </div>
      <WatchlistDecisionHistory key={item.decision_version} item={item} onRestored={onSaved} />
    </section>
  );
}
