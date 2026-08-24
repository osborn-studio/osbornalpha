'use client';

import { useTranslations } from 'next-intl';
import { MarketLabel } from '@/components/MarketLabel';
import { formatPct } from '@/lib/utils';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import type { AssetType, Market } from '@/lib/supabase/database.types';
import { buildPostAddInsight } from '@/lib/watchlist/insight';

export interface PostAddAsset {
  t: string;
  n: string;
  m: Market;
  asset_type: AssetType;
}

interface PostAddInsightProps {
  asset: PostAddAsset;
  quote: LiveQuote | null | undefined;
  onAnalyze: () => void;
  onDismiss: () => void;
}

export function PostAddInsight({
  asset,
  quote,
  onAnalyze,
  onDismiss,
}: PostAddInsightProps) {
  const t = useTranslations('market.watchlist.postAdd');
  const assetTypes = useTranslations('market.watchlist.assetTypes');
  const insight = buildPostAddInsight({
    ticker: asset.t,
    assetType: asset.asset_type,
    quote: quote ? { change_pct: quote.change_pct, delayed: quote.delayed } : null,
  });
  const message = insight.changePct === null
    ? t(insight.messageKey)
    : t(insight.messageKey, { change: formatPct(insight.changePct) });

  return (
    <section
      className="mb-3 rounded-md border border-accent-dim bg-accent-dim/10 p-3"
      aria-live="polite"
      aria-label={t('title', { ticker: asset.t })}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{asset.n}</span>
            <span className="text-xs tabular-nums text-text-dim">{asset.t}</span>
            <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
              <MarketLabel m={asset.m} />
            </span>
            <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
              {assetTypes(asset.asset_type)}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-text-dim">{message}</p>
          {insight.stale && <p className="mt-1 text-[11px] text-text-muted">{t('stale')}</p>}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-text-dim hover:bg-bg-card hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title={t('dismiss')}
          aria-label={t('dismiss')}
        >
          ×
        </button>
      </div>
      <button
        type="button"
        onClick={onAnalyze}
        className="mt-3 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        {t('analyze')}
      </button>
    </section>
  );
}
