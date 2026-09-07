'use client';

import { Database, FileSearch, Sparkles, BellRing } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseWatchlistDecisionContext } from '@/lib/watchlist/decision-context';

export function WatchlistDecisionContext({ value }: { value: unknown }) {
  const t = useTranslations('market.table.drawer.decision.context');
  const context = parseWatchlistDecisionContext(value);
  if (!context) return null;
  const rows = [
    {
      id: 'metric', icon: Database,
      value: context.metric ? t('metricValue', { range: context.metric.historyRange ?? '--', benchmark: context.metric.benchmarkTicker ?? '--', coverage: context.metric.coverageRatio == null ? '--' : Math.round(context.metric.coverageRatio * 100) }) : t('unavailable'),
      detail: context.metric?.calculatorVersion ?? null,
    },
    {
      id: 'research', icon: FileSearch,
      value: t('researchValue', { news: context.research.newsCount, reports: context.research.reportCount }),
      detail: context.research.latestFetchedAt ? new Date(context.research.latestFetchedAt).toLocaleString() : null,
    },
    {
      id: 'perspective', icon: Sparkles,
      value: context.perspective ? t('perspectiveValue', { evidence: context.perspective.evidenceCount, coverage: context.perspective.evidenceCoverageRatio == null ? '--' : Math.round(context.perspective.evidenceCoverageRatio * 100) }) : t('unavailable'),
      detail: context.perspective ? [context.perspective.modelVersion, context.perspective.promptVersion].filter(Boolean).join(' · ') : null,
    },
    {
      id: 'alerts', icon: BellRing,
      value: t('alertsValue', { unread: context.alerts.unreadCount, failed: context.alerts.failedDeliveryCount, reviews: context.reviewReasonCount }),
      detail: context.alerts.latestTriggeredAt ? new Date(context.alerts.latestTriggeredAt).toLocaleString() : null,
    },
  ];
  return (
    <details className="mt-2 rounded border border-border/70 bg-bg-elevated/35 px-2.5">
      <summary className="cursor-pointer py-2 text-[11px] font-medium text-text-dim">{t('title')}</summary>
      <div className="grid gap-2 border-t border-border/70 py-2 sm:grid-cols-2">
        {rows.map((row) => <div key={row.id} className="grid grid-cols-[16px_minmax(0,1fr)] gap-1.5"><row.icon className="mt-0.5 h-3.5 w-3.5 text-text-muted" aria-hidden="true" /><span className="min-w-0"><span className="block text-[11px] text-text-dim">{row.value}</span>{row.detail && <span className="block truncate text-[10px] text-text-muted" title={row.detail}>{row.detail}</span>}</span></div>)}
      </div>
    </details>
  );
}
