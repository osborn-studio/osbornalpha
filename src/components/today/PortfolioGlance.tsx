'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Panel, Metric } from '@/components/ui';
import { usePortfolio, useDecisions } from '@/lib/hooks/usePortfolio';
import { useBatchQuotes } from '@/lib/hooks/useQuote';
import { portfolioSummary } from '@/lib/portfolio/pnl';
import { formatPct } from '@/lib/utils';

export function PortfolioGlance() {
  const t = useTranslations('today');
  const { data, loading } = usePortfolio();
  const { decisions } = useDecisions({ status: 'open' });

  const positions = data?.positions ?? [];
  const openPositions = useMemo(
    () => positions.filter((p) => p.shares > 0 && !p.closed_at),
    [positions],
  );
  const tickers = useMemo(() => openPositions.map((p) => p.ticker), [openPositions]);
  const { quotes } = useBatchQuotes(tickers, { refreshIntervalMs: 60_000 });

  const prices = useMemo(() => {
    const out: Record<string, number | null | undefined> = {};
    for (const t of tickers) out[t] = quotes[t]?.price ?? null;
    return out;
  }, [tickers, quotes]);

  const summary = useMemo(() => portfolioSummary(positions, prices), [positions, prices]);
  const unrealizedPct = summary.marketValue > 0
    ? (summary.unrealized / (summary.marketValue - summary.unrealized)) * 100
    : 0;

  return (
    <Panel title={t('portfolio.title')}>
      {loading ? (
        <div className="py-4 text-center text-xs text-text-dim">{t('portfolio.loading')}</div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Metric label={t('portfolio.unrealized')} value={`${summary.unrealized >= 0 ? '+' : ''}${summary.unrealized.toFixed(0)}`} change={summary.unrealized} />
            <Metric label={t('portfolio.unrealizedPct')} value={formatPct(unrealizedPct)} change={unrealizedPct} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Metric label={t('portfolio.marketValue')} value={summary.marketValue.toFixed(0)} />
            <Metric label={t('portfolio.openCount')} value={String(summary.openCount)} />
          </div>
          <div className="text-[11px] text-text-dim">{t('portfolio.openDecisions', { count: decisions.length })}</div>
          <Link href="/portfolio" className="block text-right text-xs text-accent hover:underline">
            {t('portfolio.viewAll')}
          </Link>
        </div>
      )}
    </Panel>
  );
}
