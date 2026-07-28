'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { usePortfolio } from '@/lib/hooks/usePortfolio';
import { uniqueWatchlistTickers } from '@/lib/watchlist/store';
import { marketPhase, marketOfTicker, type MarketPhaseV2 } from '@/lib/today/clock';
import type { Market } from '@/lib/supabase/database.types';
import { RadarStream } from '@/components/today/RadarStream';
import { PortfolioGlance } from '@/components/today/PortfolioGlance';
import { MacroGlance } from '@/components/today/MacroGlance';
import { BriefGlance } from '@/components/today/BriefGlance';

const MARKET_ORDER: Market[] = ['A', 'HK', 'US', 'JP', 'KR', 'TW'];

export default function TodayPage() {
  const t = useTranslations('today');
  const { groups, hydrated } = useWatchlist();
  const { data: portfolio, loading: portfolioLoading } = usePortfolio();

  const watchTickers = useMemo(() => uniqueWatchlistTickers(groups), [groups]);
  const positionTickers = useMemo(
    () => (portfolio?.positions ?? []).filter((p) => p.shares > 0 && !p.closed_at).map((p) => p.ticker),
    [portfolio],
  );
  const allTickers = useMemo(
    () => Array.from(new Set([...watchTickers, ...positionTickers])),
    [watchTickers, positionTickers],
  );

  // Markets relevant to the user's holdings + watchlist, in fixed A→HK→US
  // order; empty set falls back to A-shares only.
  const markets = useMemo(() => {
    const s = new Set(allTickers.map(marketOfTicker));
    const list = MARKET_ORDER.filter((m) => s.has(m));
    return list.length > 0 ? list : (['A'] as Market[]);
  }, [allTickers]);

  const [phases, setPhases] = useState<Partial<Record<Market, MarketPhaseV2>>>({});
  useEffect(() => {
    const tick = () => setPhases(Object.fromEntries(markets.map((m) => [m, marketPhase(m, new Date())])));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [markets]);

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold">{t('page.title')}</h1>
        <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-text-dim">
          {markets.map((m) => {
            const p = phases[m];
            if (!p) return null;
            const dot = p.phase === 'open' ? 'bg-[var(--up)]' : p.phase === 'lunch' ? 'bg-[var(--warn)]' : 'bg-[var(--text-dim)]';
            return (
              <span key={m} className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
                <span className="font-semibold">{t(`clock.market.${m}`)}</span>
                {t(`phase.${p.phaseKey}`, { minutes: p.minutes ?? 0 })}
              </span>
            );
          })}
        </div>
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
