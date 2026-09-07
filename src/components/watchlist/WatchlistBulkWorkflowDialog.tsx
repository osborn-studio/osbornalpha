'use client';

import { useMemo, useState } from 'react';
import { BellRing, CalendarClock, Check, RefreshCw, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDialogFocusTrap } from '@/lib/hooks/useDialogFocusTrap';
import { useWatchlistBulkWorkflow } from '@/lib/hooks/useWatchlistBulkWorkflow';
import type { WatchlistBulkWorkflowResult } from '@/lib/watchlist/bulk-workflow';
import { WatchlistAlertRuleEditor } from './WatchlistAlertRuleEditor';
import { nextRovingTab } from '@/lib/keyboard/roving-tabs';

export interface WatchlistBulkWorkflowTarget {
  ticker: string;
  itemId: string | null;
  expectedVersion: number | null;
}

export type WatchlistBulkWorkflowOperation = 'research' | 'alert' | 'review';
const OPERATIONS: WatchlistBulkWorkflowOperation[] = ['research', 'alert', 'review'];

function futureDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const RESULT_ERROR_KEYS = {
  rate_limited: 'rateLimited',
  watchlist_research_plan_limit: 'researchPlanLimit',
  watchlist_item_not_found: 'itemNotFound',
  research_refresh_failed: 'researchFailed',
  watchlist_alert_plan_limit: 'alertPlanLimit',
  watchlist_alert_create_failed: 'alertFailed',
  watchlist_decision_conflict: 'decisionConflict',
  watchlist_review_update_failed: 'reviewFailed',
} as const;

export function WatchlistBulkWorkflowDialog({
  targets,
  initialOperation = 'research',
  onCompleted,
  onClose,
}: {
  targets: WatchlistBulkWorkflowTarget[];
  initialOperation?: WatchlistBulkWorkflowOperation;
  onCompleted?: (result: WatchlistBulkWorkflowResult) => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('market.table.bulkWorkflow');
  const [operation, setOperation] = useState<WatchlistBulkWorkflowOperation>(initialOperation);
  const [reviewDate, setReviewDate] = useState(() => futureDate(7));
  const [confirmComplete, setConfirmComplete] = useState(false);
  const model = useWatchlistBulkWorkflow(onCompleted);
  const panelRef = useDialogFocusTrap<HTMLElement>(onClose);
  const itemIds = useMemo(() => targets.flatMap((target) => target.itemId ? [target.itemId] : []), [targets]);
  const reviewTargets = useMemo(() => targets.flatMap((target) => target.itemId && target.expectedVersion !== null
    ? [{ itemId: target.itemId, expectedVersion: target.expectedVersion }]
    : []), [targets]);
  const unavailable = targets.length - (operation === 'research'
    ? targets.length
    : operation === 'alert' ? itemIds.length : reviewTargets.length);
  const switchOperation = (next: WatchlistBulkWorkflowOperation) => {
    setOperation(next);
    setConfirmComplete(false);
    model.reset();
  };
  const moveOperation = (current: WatchlistBulkWorkflowOperation, key: string) => {
    const next = nextRovingTab(OPERATIONS, current, key);
    if (!next) return false;
    switchOperation(next);
    window.requestAnimationFrame(() => document.getElementById(`watchlist-bulk-tab-${next}`)?.focus());
    return true;
  };
  const scheduleReview = () => model.review(reviewTargets, 'snooze', `${reviewDate}T12:00:00.000Z`);
  const completeReview = () => model.review(reviewTargets, 'complete', null).then(() => setConfirmComplete(false));

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/65 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="watchlist-bulk-workflow-title" className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden border border-border bg-bg-card shadow-2xl sm:max-h-[88dvh] sm:rounded-lg">
        <header className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent/20 bg-accent/10 text-accent"><RefreshCw className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="watchlist-bulk-workflow-title" className="text-sm font-semibold text-text">{t('title')}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">{targets.slice(0, 6).map((target) => <span key={target.ticker} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-dim">{target.ticker}</span>)}{targets.length > 6 && <span className="px-1 py-0.5 text-[10px] text-text-muted">+{targets.length - 6}</span>}</div>
          </div>
          <button type="button" onClick={onClose} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('close')} title={t('close')}><X className="h-4 w-4" aria-hidden="true" /></button>
        </header>

        <nav className="grid grid-cols-3 border-b border-border bg-bg-elevated/60 p-1" role="tablist" aria-label={t('tabsLabel')}>
          {([
            ['research', Search], ['alert', BellRing], ['review', CalendarClock],
          ] as const).map(([key, Icon]) => <button key={key} id={`watchlist-bulk-tab-${key}`} type="button" role="tab" aria-selected={operation === key} aria-controls={`watchlist-bulk-panel-${key}`} tabIndex={operation === key ? 0 : -1} onClick={() => switchOperation(key)} onKeyDown={(event) => { if (moveOperation(key, event.key)) event.preventDefault(); }} className={`flex h-9 items-center justify-center gap-1.5 rounded text-xs ${operation === key ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-muted hover:text-text'}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{t(`tabs.${key}`)}</button>)}
        </nav>

        <div id={`watchlist-bulk-panel-${operation}`} role="tabpanel" aria-labelledby={`watchlist-bulk-tab-${operation}`} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {operation === 'research' && <div className="flex min-h-28 items-center justify-center"><button type="button" disabled={model.saving} onClick={() => void model.research(targets.map((target) => target.ticker))} className="inline-flex h-10 items-center gap-2 rounded bg-accent-dim px-4 text-xs font-semibold text-white disabled:opacity-50"><Search className="h-4 w-4" aria-hidden="true" />{t(model.saving ? 'running' : 'researchAction')}</button></div>}

          {operation === 'alert' && <WatchlistAlertRuleEditor idPrefix="bulk-alert" saving={model.saving || itemIds.length === 0} submitText={t('alertAction')} onSubmit={async (rule) => !!await model.alert(itemIds, rule)} />}

          {operation === 'review' && <div className="space-y-4">
            <label className="block"><span className="mb-1.5 block text-[11px] font-medium text-text-muted">{t('reviewDate')}</span><input type="date" min={futureDate(1)} value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} className="h-9 w-full text-xs sm:w-52" /></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={model.saving || !reviewDate || reviewTargets.length === 0} onClick={() => void scheduleReview()} className="inline-flex h-9 items-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{t('scheduleAction')}</button>
              {!confirmComplete ? <button type="button" disabled={model.saving || reviewTargets.length === 0} onClick={() => setConfirmComplete(true)} className="inline-flex h-9 items-center gap-1.5 rounded border border-border px-3 text-xs text-text-dim disabled:opacity-50"><Check className="h-3.5 w-3.5" aria-hidden="true" />{t('completeAction')}</button> : <div className="flex items-center gap-2 rounded border border-warn/30 bg-warn/5 px-2"><span className="text-[11px] text-warn">{t('completeConfirm')}</span><button type="button" onClick={() => setConfirmComplete(false)} className="text-[11px] text-text-muted">{t('cancel')}</button><button type="button" disabled={model.saving} onClick={() => void completeReview()} className="text-[11px] font-semibold text-warn">{t('confirm')}</button></div>}
            </div>
          </div>}

          {unavailable > 0 && <p className="mt-4 border-l-2 border-warn bg-warn/5 px-2.5 py-2 text-[11px] text-warn" role="status">{t('unavailable', { count: unavailable })}</p>}
          {model.error && <div className="mt-4 flex items-center justify-between gap-3" role="alert"><p className="text-xs text-status-bad">{t('error')}</p>{model.canResume && <button type="button" disabled={model.saving} onClick={() => void model.resume()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-border px-2.5 text-[11px] text-text-dim disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${model.saving ? 'animate-spin' : ''}`} aria-hidden="true" />{t('resume')}</button>}</div>}
          {model.result && <section className="mt-5 border-t border-border pt-4" aria-label={t('resultLabel')}>
            <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-[11px] font-semibold text-text">{t('resultLabel')}</h3>{model.canRetry && <button type="button" disabled={model.saving} onClick={() => void model.retry()} className="inline-flex h-8 items-center gap-1.5 rounded border border-border px-2.5 text-[11px] text-text-dim disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${model.saving ? 'animate-spin' : ''}`} aria-hidden="true" />{t('retry')}</button>}</div>
            <div className="grid grid-cols-4 divide-x divide-border rounded border border-border bg-bg-elevated text-center text-[11px]">
              <span className="px-1 py-2 text-status-good"><strong className="block font-mono text-sm">{model.result.succeeded}</strong>{t('result.succeeded')}</span>
              <span className="px-1 py-2 text-text-dim"><strong className="block font-mono text-sm">{model.result.unchanged}</strong>{t('result.unchanged')}</span>
              <span className="px-1 py-2 text-warn"><strong className="block font-mono text-sm">{model.result.conflicted}</strong>{t('result.conflicted')}</span>
              <span className="px-1 py-2 text-status-bad"><strong className="block font-mono text-sm">{model.result.failed}</strong>{t('result.failed')}</span>
            </div>
            {model.result.results.some((result) => result.status === 'failed' || result.status === 'conflict') && <div className="mt-3 divide-y divide-border/70 border-y border-border/70">{model.result.results.filter((result) => result.status === 'failed' || result.status === 'conflict').map((result) => { const errorKey = result.code ? RESULT_ERROR_KEYS[result.code as keyof typeof RESULT_ERROR_KEYS] : null; return <div key={result.key} className="flex items-center gap-2 py-2 text-[11px]"><span className="min-w-0 flex-1 truncate font-mono text-text">{targets.find((target) => target.itemId === result.key)?.ticker ?? result.key}</span><span className={result.status === 'conflict' ? 'text-warn' : 'text-status-bad'}>{result.status === 'conflict' ? t('result.conflicted') : t('result.failed')}</span><span className="truncate text-text-muted">{errorKey ? t(`errors.${errorKey}`) : t('unknownError')}</span></div>; })}</div>}
          </section>}
        </div>
      </section>
    </div>
  );
}
