'use client';

import { useTranslations } from 'next-intl';
import { Panel, Metric } from '@/components/ui';
import { unrealizedPnl, portfolioSummary } from '@/lib/portfolio/pnl';
import { cn, formatPct, formatPrice } from '@/lib/utils';
import type { Position } from '@/lib/supabase/database.types';
import type { LiveQuote } from '@/lib/hooks/useQuote';

export function PositionsRail({ positions, quotes, watchTickers, focus, onFocus }: {
  positions: Position[];
  quotes: Record<string, LiveQuote | null>;
  watchTickers: string[];
  focus: string | null;
  onFocus: (t: string) => void;
}) {
  const t = useTranslations('portfolio');
  const prices = Object.fromEntries(Object.entries(quotes).map(([tk, q]) => [tk, q?.price ?? null]));
  const sum = portfolioSummary(positions, prices);
  const open = positions.filter((p) => p.shares > 0 && !p.closed_at);
  const held = new Set(open.map((p) => p.ticker));

  return (
    <div className="space-y-3">
      <Panel title={t('positionsRail.positionsTitle', { count: open.length })}>
        <div className="space-y-[var(--row-gap)]">
          {open.map((p) => {
            const q = quotes[p.ticker];
            const u = unrealizedPnl(p, q?.price ?? null);
            return (
              <button key={p.ticker} onClick={() => onFocus(p.ticker)}
                className={cn(
                  'num flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs',
                  focus === p.ticker
                    ? 'border-l-2 border-[var(--accent)] bg-[var(--bg-card)]'
                    : 'border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg-card)]',
                )}>
                <span>{q?.name ?? p.ticker}</span>
                <span className={u && u.value >= 0 ? 'text-up' : 'text-down'}>
                  {u ? formatPct(u.pct) : '--'}
                </span>
              </button>
            );
          })}
          {!open.length && <p className="text-xs text-[var(--text-dim)]">{t('positionsRail.emptyPositions')}</p>}
        </div>
        <div className="mt-2 flex gap-3 border-t border-[var(--border)] pt-2">
          <Metric label={t('positionsRail.totalUnrealized')} value={formatPrice(sum.unrealized)} change={sum.unrealized} />
          <Metric label={t('positionsRail.totalMarketValue')} value={formatPrice(sum.marketValue)} />
          <Metric label={t('positionsRail.totalRealized')} value={formatPrice(sum.realized)} change={sum.realized} />
        </div>
      </Panel>

      <Panel title={t('positionsRail.watchlistTitle')}>
        <div className="space-y-1">
          {watchTickers.filter((tk) => !held.has(tk)).slice(0, 20).map((tk) => {
            const q = quotes[tk];
            return (
              <button key={tk} onClick={() => onFocus(tk)}
                className={cn('num flex w-full items-center justify-between px-2 py-1 text-left text-xs rounded',
                  focus === tk ? 'bg-[var(--bg-card)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]')}>
                <span>{q?.name ?? tk}</span>
                {q && <span className={q.change_pct >= 0 ? 'text-up' : 'text-down'}>{formatPct(q.change_pct)}</span>}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
