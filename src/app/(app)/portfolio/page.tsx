'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { useBatchQuotes } from '@/lib/hooks/useQuote';
import { useDecisions, usePortfolio } from '@/lib/hooks/usePortfolio';
import { PositionsRail } from '@/components/portfolio/PositionsRail';
import { FocusPanel } from '@/components/portfolio/FocusPanel';
import { SignalsRail } from '@/components/portfolio/SignalsRail';

function CockpitInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: portfolio, refetch: refetchPortfolio } = usePortfolio();
  const { decisions, refetch: refetchDecisions } = useDecisions();
  const { groups } = useWatchlist();

  const positions = useMemo(() => portfolio?.positions ?? [], [portfolio]);
  const openPositions = useMemo(() => positions.filter((p) => p.shares > 0 && !p.closed_at), [positions]);
  const watchTickers = useMemo(() => [...new Set(groups.flatMap((g) => g.tickers))], [groups]);
  const allTickers = useMemo(
    () => [...new Set([...openPositions.map((p) => p.ticker), ...watchTickers])],
    [openPositions, watchTickers],
  );
  const { quotes } = useBatchQuotes(allTickers, { refreshIntervalMs: 60_000 });

  const focus = params.get('s') || openPositions[0]?.ticker || watchTickers[0] || null;
  const setFocus = (t: string) => router.replace(`/portfolio?s=${encodeURIComponent(t)}`, { scroll: false });

  const openDecisions = decisions.filter((d) => d.status === 'open');
  const onChanged = () => { refetchPortfolio(); refetchDecisions(); };

  return (
    <div className="p-4">
      <nav className="mb-3 flex gap-4 text-xs">
        <span className="text-[var(--accent)]">驾驶舱</span>
        <a href="/portfolio/decisions" className="text-[var(--text-dim)] hover:text-[var(--text)]">决策日志</a>
        <a href="/portfolio/positions" className="text-[var(--text-dim)] hover:text-[var(--text)]">持仓明细</a>
        <a href="/portfolio/review" className="text-[var(--text-dim)] hover:text-[var(--text)]">复盘</a>
      </nav>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_320px]">
      <PositionsRail positions={positions} quotes={quotes} watchTickers={watchTickers} focus={focus} onFocus={setFocus} />
      {focus ? (
        <FocusPanel
          ticker={focus}
          quote={quotes[focus] ?? null}
          position={openPositions.find((p) => p.ticker === focus) ?? null}
          decisions={decisions}
          onChanged={onChanged}
        />
      ) : (
        <div className="flex items-center justify-center text-sm text-[var(--text-dim)]">
          股票池为空——先到 📋 股票池 添加观察标的
        </div>
      )}
      <SignalsRail ticker={focus} openDecisions={openDecisions} onFocus={setFocus} />
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense>
      <CockpitInner />
    </Suspense>
  );
}
