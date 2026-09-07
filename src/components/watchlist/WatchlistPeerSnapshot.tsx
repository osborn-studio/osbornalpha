'use client';

import { useTranslations } from 'next-intl';
import type { DataEnvelope } from '@/lib/watchlist/overview-contract';
import type { WatchlistPeerMetrics } from '@/lib/watchlist/peer-metrics';
import { WatchlistPercentileCell } from './WatchlistPercentileCell';
import { WatchlistDataStatus } from './WatchlistDataStatus';
import { formatVolume } from '@/lib/utils';

function PeerMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 border-b border-border/60 px-1 py-3"><div className="mb-1.5 truncate text-[11px] font-medium text-text-muted" title={label}>{label}</div>{children}</div>;
}

export function WatchlistPeerSnapshot({ envelope }: { envelope?: DataEnvelope<WatchlistPeerMetrics> | null }) {
  const t = useTranslations('market.table.drawer.peer');
  const peer = envelope?.value;
  if (!peer) return null;
  return (
    <section className="mt-6" aria-label={t('title')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-text-dim">
        <div className="min-w-0"><span>{t('title')}</span><span className="ml-2 truncate font-normal text-text-muted">{peer.industry ?? t('industryUnavailable')}</span></div>
        <WatchlistDataStatus label={t('dataStatus')} envelope={envelope} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
        <PeerMetric label={t('relativeStrength')}><WatchlistPercentileCell value={peer.marketRelativeStrengthPercentile} sampleSize={peer.marketRelativeStrengthSampleSize} label={t('relativeStrength')} /></PeerMetric>
        <PeerMetric label={t('pe')}><WatchlistPercentileCell value={peer.industryPePercentile} sampleSize={peer.industryPeSampleSize} label={t('pe')} tone="valuation" /></PeerMetric>
        <PeerMetric label={t('pb')}><WatchlistPercentileCell value={peer.industryPbPercentile} sampleSize={peer.industryPbSampleSize} label={t('pb')} tone="valuation" /></PeerMetric>
        <PeerMetric label={t('liquidity')}><WatchlistPercentileCell value={peer.marketLiquidityPercentile} sampleSize={peer.marketLiquiditySampleSize} label={t('liquidity')} /></PeerMetric>
        <PeerMetric label={t('averageAmount')}><div className="text-sm font-semibold tabular-nums text-text">{peer.averageTradedAmount20 == null ? '--' : `${formatVolume(peer.averageTradedAmount20)} ${peer.currency ?? ''}`}</div></PeerMetric>
        <PeerMetric label={t('capShare')}><div className="text-sm font-semibold tabular-nums text-text">{peer.watchlistMarketCapSharePct == null ? '--' : `${peer.watchlistMarketCapSharePct.toFixed(1)}%`}</div></PeerMetric>
      </div>
    </section>
  );
}
