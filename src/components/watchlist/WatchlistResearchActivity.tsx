'use client';

import {
  Activity,
  ArrowUpRight,
  Bell,
  CalendarDays,
  FileSearch,
  FileText,
  Newspaper,
  NotebookPen,
  RefreshCw,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink } from '@/components/ExternalLink';
import type { WatchlistResearchTimelineItem, WatchlistResearchTimelineKind } from '@/lib/watchlist/research-timeline';
import { watchlistProviderLabel } from '@/lib/watchlist/provider-label';

type TimelineFilter = 'all' | WatchlistResearchTimelineKind;
type TimelineRange = '7d' | '30d' | 'all';

const FILTERS: TimelineFilter[] = ['all', 'news', 'filing', 'report', 'perspective', 'calendar', 'decision', 'alert'];
const TIMELINE_ICONS: Record<WatchlistResearchTimelineKind, LucideIcon> = {
  news: Newspaper,
  filing: FileSearch,
  report: FileText,
  perspective: Sparkles,
  calendar: CalendarDays,
  decision: NotebookPen,
  alert: Bell,
};

export function WatchlistResearchActivity({ timeline, lastSeenAt }: {
  timeline: WatchlistResearchTimelineItem[];
  lastSeenAt: string | null;
}) {
  const t = useTranslations('market.table.drawer.research');
  const providerT = useTranslations('market.table.providers');
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<TimelineRange>('30d');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [limit, setLimit] = useState(25);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const cutoff = range === 'all' ? null : Date.now() - Number.parseInt(range, 10) * 24 * 60 * 60_000;
    return timeline.filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (normalizedQuery && !`${item.title} ${item.source} ${item.detail ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      if (cutoff != null && item.at && new Date(item.at).getTime() < cutoff) return false;
      const unseenByActivity = !!item.at && !!lastSeenAt && item.at > lastSeenAt;
      return !unreadOnly || item.read === false || unseenByActivity;
    });
  }, [filter, lastSeenAt, query, range, timeline, unreadOnly]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((value) => [
    value,
    value === 'all' ? timeline.length : timeline.filter((item) => item.kind === value).length,
  ])), [timeline]);
  const visible = filtered.slice(0, limit);
  useEffect(() => setLimit(25), [filter, query, range, unreadOnly]);

  return (
    <details className="mt-4 border-y border-border/70">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-xs font-semibold text-text-dim marker:hidden">
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('timeline.title')}</span>
        <span className="font-mono font-normal text-text-muted">{timeline.length}</span>
      </summary>
      <div className="pb-3">
        <div className="mb-2 flex max-w-full gap-1 overflow-x-auto pb-1" role="group" aria-label={t('timeline.filter')}>
          {FILTERS.map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`h-7 shrink-0 rounded px-2 text-[11px] ${filter === value ? 'bg-bg-hover font-semibold text-text' : 'text-text-muted hover:text-text'}`}>{t(`timeline.kinds.${value}`)} <span className="tabular-nums">{counts[value] ?? 0}</span></button>)}
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="relative"><span className="sr-only">{t('timeline.search')}</span><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('timeline.search')} className="h-8 w-full pl-8 text-xs" /></label>
          <select value={range} onChange={(event) => setRange(event.target.value as TimelineRange)} aria-label={t('timeline.range')} className="h-8 text-xs"><option value="7d">{t('timeline.ranges.7d')}</option><option value="30d">{t('timeline.ranges.30d')}</option><option value="all">{t('timeline.ranges.all')}</option></select>
          <label className="inline-flex h-8 items-center gap-2 rounded border border-border px-2.5 text-[11px] text-text-dim"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />{t('timeline.unreadOnly')}</label>
        </div>
        {visible.length === 0 ? <div className="border-y border-border py-8 text-center text-xs text-text-muted"><p>{t('timeline.empty')}</p>{(filter !== 'all' || query || range !== 'all' || unreadOnly) && <button type="button" onClick={() => { setFilter('all'); setQuery(''); setRange('all'); setUnreadOnly(false); }} className="mt-3 h-8 rounded border border-border px-3 text-text-dim hover:text-text">{t('timeline.clearFilters')}</button>}</div> : (
          <>
            <div className="divide-y divide-border/70 border-y border-border/70">{visible.map((item) => {
              const Icon = TIMELINE_ICONS[item.kind];
              const body = <><span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-bg-elevated ${item.read === false ? 'text-accent' : 'text-text-muted'}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium leading-snug text-text">{item.title}</span><span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-text-muted"><span>{t(`timeline.kinds.${item.kind}`)}</span><span>{watchlistProviderLabel(item.source, providerT)}</span>{item.stance && <span>{t(`perspectiveFilters.${item.stance}`)}</span>}{item.confidence != null && <span>{t('timeline.confidence', { value: item.confidence.toFixed(1) })}</span>}{item.at && <time>{new Date(item.at).toLocaleString()}</time>}</span>{item.detail && <span className="mt-1 line-clamp-2 block text-[11px] text-text-dim">{item.detail}</span>}</span>{item.url && <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />}</>;
              return <ExternalLink key={item.id} href={item.url} className="flex items-start gap-2.5 py-3 text-text hover:no-underline">{body}</ExternalLink>;
            })}</div>
            {visible.length < filtered.length && <button type="button" onClick={() => setLimit((current) => current + 25)} className="mt-2 h-8 w-full rounded border border-border text-xs text-text-dim hover:text-text">{t('timeline.loadMore', { count: filtered.length - visible.length })}</button>}
          </>
        )}
      </div>
    </details>
  );
}
