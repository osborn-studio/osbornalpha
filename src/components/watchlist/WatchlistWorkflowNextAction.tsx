'use client';

import { BellRing, FileSearch, NotebookPen, RefreshCw, SearchCheck, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WatchlistWorkflowNextAction, WatchlistWorkflowSummary } from '@/lib/watchlist/workflow-summary';

const ICONS = {
  retry_alert_delivery: RefreshCw,
  review_alert: BellRing,
  review_decision: NotebookPen,
  refresh_research: RefreshCw,
  generate_perspectives: Sparkles,
  document_thesis: NotebookPen,
  continue_research: FileSearch,
  monitor: SearchCheck,
};

export function WatchlistWorkflowNextAction({ workflow, onAction }: {
  workflow: WatchlistWorkflowSummary;
  onAction: (action: WatchlistWorkflowNextAction) => void;
}) {
  const t = useTranslations('market.table.drawer.research.workflow');
  const Icon = ICONS[workflow.nextAction];
  const actionable = workflow.nextAction !== 'monitor';
  const priority = workflow.priority ?? { score: 0, reasons: ['monitoring_current' as const] };
  return (
    <section className="mb-4 grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 border-y border-border/70 bg-bg-elevated/35 px-2 py-2.5" aria-label={t('label')}>
      <span className="flex h-7 w-7 items-center justify-center rounded bg-accent/10 text-accent"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
      <span className="min-w-0"><span className="flex items-center gap-2 text-[10px] font-medium uppercase text-text-muted"><span>{t('label')}</span>{priority.score > 0 && <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[9px] text-text-dim">{t('priority', { score: priority.score })}</span>}</span><span className="block truncate text-xs font-semibold text-text">{t(`actions.${workflow.nextAction}`)}</span><span className="mt-0.5 block truncate text-[10px] text-text-muted">{t(`reasons.${priority.reasons[0]}`)}</span></span>
      {actionable && <button type="button" onClick={() => onAction(workflow.nextAction)} className="h-8 rounded bg-accent-dim px-3 text-xs font-semibold text-white">{t('open')}</button>}
    </section>
  );
}
