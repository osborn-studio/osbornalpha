'use client';

import { CalendarClock, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WatchlistReviewSummary as ReviewSummary } from '@/lib/watchlist/review-workflow';

export function WatchlistReviewSummary({ summary, loading, onOpen }: {
  summary: ReviewSummary;
  loading: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations('market.watchlist.review');
  const due = summary.overdue + summary.dueToday;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`mb-3 flex min-h-11 w-full items-center gap-3 border-y px-3 py-2 text-left transition-colors ${due > 0 ? 'border-warn/30 bg-warn/5 hover:bg-warn/10' : 'border-border/70 bg-bg-elevated/30 hover:bg-bg-hover'}`}
      aria-label={t('open')}
    >
      <CalendarClock className={`h-4 w-4 shrink-0 ${due > 0 ? 'text-warn' : 'text-text-muted'}`} aria-hidden="true" />
      <span className="text-xs font-semibold text-text">{t('title')}</span>
      {due > 0 && <span className="min-w-5 rounded-full bg-warn px-1.5 text-center font-mono text-[10px] font-bold leading-5 text-black">{due}</span>}
      {loading ? <span className="h-3 w-28 animate-pulse rounded bg-bg-elevated" /> : (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
          <span className={summary.overdue > 0 ? 'text-status-bad' : ''}>{t('overdue', { count: summary.overdue })}</span>
          <span className={summary.dueToday > 0 ? 'text-warn' : ''}>{t('dueToday', { count: summary.dueToday })}</span>
          <span>{t('upcoming', { count: summary.upcoming })}</span>
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
    </button>
  );
}
