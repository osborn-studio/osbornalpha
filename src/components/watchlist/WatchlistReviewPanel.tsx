'use client';

import { CalendarClock, Check, Clock3, RefreshCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDialogFocusTrap } from '@/lib/hooks/useDialogFocusTrap';
import type { useWatchlistReviews } from '@/lib/hooks/useWatchlistReviews';
import type { WatchlistReviewQueueRow, WatchlistReviewScope } from '@/lib/watchlist/review-workflow';

type ReviewModel = ReturnType<typeof useWatchlistReviews>;
const SCOPES: WatchlistReviewScope[] = ['due', 'upcoming', 'unscheduled', 'all'];

function futureDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function WatchlistReviewPanel({ model, onOpenTicker, onClose }: {
  model: ReviewModel;
  onOpenTicker: (ticker: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('market.watchlist.review');
  const ref = useDialogFocusTrap<HTMLDivElement>(onClose);
  const errorKey = model.errorCode === 'watchlist_decision_conflict' ? 'conflict' : 'error';

  function actionButton(row: WatchlistReviewQueueRow, days: number) {
    return <button type="button" disabled={model.savingId === row.item.id} onClick={() => void model.act(row, 'snooze', futureDate(days))} className="h-8 rounded border border-border px-2.5 text-[11px] text-text-dim hover:text-text disabled:opacity-50">{t('snoozeDays', { count: days })}</button>;
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="watchlist-review-title" onClick={(event) => event.stopPropagation()} className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-border bg-bg shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <CalendarClock className="h-4 w-4 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1"><h2 id="watchlist-review-title" className="text-sm font-semibold text-text">{t('title')}</h2><p className="mt-0.5 text-[11px] text-text-muted">{t('subtitle')}</p></div>
          <button type="button" onClick={() => void model.refetch()} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('refresh')} title={t('refresh')}><RefreshCw className={`h-3.5 w-3.5 ${model.loading ? 'animate-spin' : ''}`} aria-hidden="true" /></button>
          <button type="button" onClick={onClose} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent" aria-label={t('close')}><X className="h-4 w-4" aria-hidden="true" /></button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2" aria-label={t('filters')}>
          {SCOPES.map((scope) => <button key={scope} type="button" aria-pressed={model.scope === scope} onClick={() => model.setScope(scope)} className={`h-8 shrink-0 rounded px-3 text-xs ${model.scope === scope ? 'bg-bg-hover font-semibold text-text' : 'text-text-muted hover:text-text'}`}>{t(`scopes.${scope}`)}</button>)}
        </nav>
        <div className="grid grid-cols-3 border-b border-border/70 text-center text-[11px] text-text-muted">
          <span className="py-2"><strong className="mr-1 text-status-bad">{model.summary.overdue}</strong>{t('overdueLabel')}</span>
          <span className="border-x border-border/70 py-2"><strong className="mr-1 text-warn">{model.summary.dueToday}</strong>{t('todayLabel')}</span>
          <span className="py-2"><strong className="mr-1 text-text">{model.summary.upcoming}</strong>{t('nextSevenDays')}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {model.loading && !model.queue ? <div className="space-y-3 py-4" role="status"><div className="h-20 animate-pulse rounded bg-bg-elevated" /><div className="h-20 animate-pulse rounded bg-bg-elevated" /></div>
            : model.queue?.rows.length === 0 ? <div className="py-12 text-center text-xs text-text-muted">{t('empty')}</div>
              : <div className="divide-y divide-border/70">{model.queue?.rows.map((row) => {
                const name = row.identity?.name ?? row.item.ticker;
                return <article key={row.item.id} className="py-3">
                  <button type="button" onClick={() => onOpenTicker(row.item.ticker)} className="flex w-full items-start gap-3 text-left">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${row.reviewBucket === 'overdue' ? 'bg-status-bad/10 text-status-bad' : 'bg-warn/10 text-warn'}`}><Clock3 className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="font-mono text-sm text-text">{row.item.ticker}</strong><span className="truncate text-xs text-text-dim">{name}</span></span><span className="mt-1 block text-[11px] text-text-muted">{row.group.name} · {row.item.review_at ? t('scheduledFor', { date: row.item.review_at.slice(0, 10) }) : t('notScheduled')}</span></span>
                    <span className={`text-[11px] ${row.reviewBucket === 'overdue' ? 'text-status-bad' : row.reviewBucket === 'due_today' ? 'text-warn' : 'text-text-muted'}`}>{t(`buckets.${row.reviewBucket}`)}</span>
                  </button>
                  <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                    {actionButton(row, 7)}
                    {actionButton(row, 30)}
                    {row.item.review_at && <button type="button" disabled={model.savingId === row.item.id} onClick={() => void model.act(row, 'complete')} className="inline-flex h-8 items-center gap-1.5 rounded bg-accent-dim px-3 text-[11px] font-semibold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" aria-hidden="true" />{t('complete')}</button>}
                  </div>
                </article>;
              })}</div>}
          {model.errorCode && <p className="sticky bottom-0 border-t border-status-bad/20 bg-bg py-3 text-xs text-status-bad" role="alert">{t(errorKey)}</p>}
        </div>
      </div>
    </div>
  );
}
