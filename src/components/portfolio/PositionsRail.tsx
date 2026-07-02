'use client';

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
  const prices = Object.fromEntries(Object.entries(quotes).map(([t, q]) => [t, q?.price ?? null]));
  const sum = portfolioSummary(positions, prices);
  const open = positions.filter((p) => p.shares > 0 && !p.closed_at);
  const held = new Set(open.map((p) => p.ticker));

  return (
    <div className="space-y-3">
      <Panel title={`持仓 · ${open.length}`}>
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
          {!open.length && <p className="text-xs text-[var(--text-dim)]">暂无持仓——从决策条开始记录你的第一笔</p>}
        </div>
        <div className="mt-2 flex gap-3 border-t border-[var(--border)] pt-2">
          <Metric label="总浮盈" value={formatPrice(sum.unrealized)} change={sum.unrealized} />
          <Metric label="总市值" value={formatPrice(sum.marketValue)} />
          <Metric label="已实现" value={formatPrice(sum.realized)} change={sum.realized} />
        </div>
      </Panel>

      <Panel title="股票池 · 观察中">
        <div className="space-y-1">
          {watchTickers.filter((t) => !held.has(t)).slice(0, 20).map((t) => {
            const q = quotes[t];
            return (
              <button key={t} onClick={() => onFocus(t)}
                className={cn('num flex w-full items-center justify-between px-2 py-1 text-left text-xs rounded',
                  focus === t ? 'bg-[var(--bg-card)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]')}>
                <span>{q?.name ?? t}</span>
                {q && <span className={q.change_pct >= 0 ? 'text-up' : 'text-down'}>{formatPct(q.change_pct)}</span>}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
