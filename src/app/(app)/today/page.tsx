'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { usePortfolio } from '@/lib/hooks/usePortfolio';
import { uniqueWatchlistTickers } from '@/lib/watchlist/store';
import { aShareMarketPhase } from '@/lib/today/clock';
import { RadarStream } from '@/components/today/RadarStream';
import { PortfolioGlance } from '@/components/today/PortfolioGlance';
import { MacroGlance } from '@/components/today/MacroGlance';
import { BriefGlance } from '@/components/today/BriefGlance';

export default function TodayPage() {
  const t = useTranslations('today');
  const { groups, hydrated } = useWatchlist();
  const { data: portfolio, loading: portfolioLoading } = usePortfolio();
  const [phaseLabel, setPhaseLabel] = useState(() => aShareMarketPhase(new Date()).label);

  useEffect(() => {
    const tick = () => setPhaseLabel(aShareMarketPhase(new Date()).label);
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const watchTickers = useMemo(() => uniqueWatchlistTickers(groups), [groups]);
  const positionTickers = useMemo(
    () => (portfolio?.positions ?? []).filter((p) => p.shares > 0 && !p.closed_at).map((p) => p.ticker),
    [portfolio],
  );
  const allTickers = useMemo(
    () => Array.from(new Set([...watchTickers, ...positionTickers])),
    [watchTickers, positionTickers],
  );

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold">{t('page.title')}</h1>
        <div className="mt-0.5 text-[11px] text-text-dim">{phaseLabel}</div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div>
          {/* Gate on hydration so an empty-watchlist flash doesn't show before data lands. */}
          {hydrated && !portfolioLoading ? (
            <RadarStream tickers={allTickers} />
          ) : (
            <p className="text-xs text-[var(--text-dim)]">{t('page.loading')}</p>
          )}
        </div>
        <div className="space-y-3">
          <PortfolioGlance />
          <MacroGlance />
          <BriefGlance />
        </div>
      </div>
    </div>
  );
}
