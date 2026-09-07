'use client';

import { BellRing, CalendarClock, ChevronDown, CircleAlert, DatabaseZap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import type { WatchlistDataCapability } from '@/lib/watchlist/data-capability';
import { watchlistDataNotices } from '@/lib/watchlist/data-notice';
import type { WatchlistReviewSummary } from '@/lib/watchlist/review-workflow';
import { buildWatchlistAttentionItems } from '@/lib/watchlist/attention-model';
import { WatchlistDataHealth } from './WatchlistDataHealth';

const ICONS = {
  delivery: CircleAlert,
  alert: BellRing,
  review: CalendarClock,
  data: DatabaseZap,
};

export function WatchlistAttentionStrip(props: {
  reviews: WatchlistReviewSummary;
  reviewLoading: boolean;
  warnings: string[];
  capabilities: WatchlistDataCapability[];
  overviewByTicker: Record<string, WatchlistOverviewRow>;
  generatedAt: string | null;
  onOpenReviews: () => void;
  onOpenAlerts: (ticker: string) => void;
  onRetryData: () => void;
}) {
  const t = useTranslations('market.watchlist.attention');
  const [dataDetailsOpen, setDataDetailsOpen] = useState(false);
  const notices = useMemo(
    () => watchlistDataNotices(props.warnings, props.capabilities),
    [props.capabilities, props.warnings],
  );
  const items = useMemo(() => buildWatchlistAttentionItems({
    reviews: props.reviews,
    notices,
    rows: props.overviewByTicker,
  }), [notices, props.overviewByTicker, props.reviews]);
  if (items.length === 0 && !props.reviewLoading) return null;

  const activate = (kind: typeof items[number]['kind'], ticker: string | null) => {
    if (kind === 'review') props.onOpenReviews();
    else if (kind === 'data') setDataDetailsOpen((open) => !open);
    else if (ticker) props.onOpenAlerts(ticker);
  };

  return (
    <section className="watchlist-attention" aria-label={t('label')}>
      <div className="watchlist-attention__heading">
        <span>{t('title')}</span>
        {props.generatedAt && <time title={new Date(props.generatedAt).toLocaleString()}>{t('updated')}</time>}
      </div>
      <div className="watchlist-attention__items">
        {props.reviewLoading && items.length === 0 ? <span className="h-8 w-40 animate-pulse rounded bg-bg-hover" /> : items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => activate(item.kind, item.ticker)}
              className="watchlist-attention__item"
              data-severity={item.severity}
              aria-expanded={item.kind === 'data' ? dataDetailsOpen : undefined}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t(`items.${item.kind}`, { count: item.count })}</span>
              {item.kind === 'data' && <ChevronDown className={`ml-1 h-3 w-3 shrink-0 opacity-60 transition-transform ${dataDetailsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {dataDetailsOpen && notices.length > 0 && (
        <div className="watchlist-attention__details">
          <WatchlistDataHealth
            warnings={props.warnings}
            capabilities={props.capabilities}
            generatedAt={props.generatedAt}
            onRetry={props.onRetryData}
          />
        </div>
      )}
    </section>
  );
}
