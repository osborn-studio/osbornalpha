'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, Metric } from '@/components/ui';
import { usePortfolio } from '@/lib/hooks/usePortfolio';
import { cn, formatPrice } from '@/lib/utils';
import type { Trade } from '@/lib/supabase/database.types';

function SubNav({ current }: { current: 'cockpit' | 'decisions' | 'positions' | 'review' }) {
  const items: Array<{ key: typeof current; href: string; label: string }> = [
    { key: 'cockpit', href: '/portfolio', label: '驾驶舱' },
    { key: 'decisions', href: '/portfolio/decisions', label: '决策日志' },
    { key: 'positions', href: '/portfolio/positions', label: '持仓明细' },
    { key: 'review', href: '/portfolio/review', label: '复盘' },
  ];
  return (
    <nav className="flex items-center gap-3 text-sm">
      {items.map((item, i) => (
        <span key={item.key} className="flex items-center gap-3">
          {i > 0 && <span className="text-[var(--text-dim)]">·</span>}
          <Link
            href={item.href}
            className={item.key === current ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}
          >
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

const DIRECTION_LABEL: Record<Trade['direction'], string> = { buy: '买入', sell: '卖出' };

function truncateId(id: string | null): string {
  if (!id) return '--';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export default function PositionsPage() {
  const { data, loading: portfolioLoading, error: portfolioError, refetch: refetchPortfolio } = usePortfolio();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/trades');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `http ${res.status}`);
      setTrades(json.trades ?? []);
      setTradesError(null);
    } catch (e) {
      setTradesError(e instanceof Error ? e.message : String(e));
    } finally {
      setTradesLoading(false);
    }
  }, []);

  useEffect(() => { loadTrades(); }, [loadTrades]);

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/trades/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `http ${res.status}`);
      await Promise.all([loadTrades(), refetchPortfolio()]);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  const positions = useMemo(() => data?.positions ?? [], [data]);
  const sortedPositions = useMemo(
    () => [...positions].sort((a, b) => {
      const aOpen = a.shares > 0 && !a.closed_at;
      const bOpen = b.shares > 0 && !b.closed_at;
      if (aOpen === bOpen) return 0;
      return aOpen ? -1 : 1;
    }),
    [positions],
  );

  return (
    <div className="space-y-4 p-4">
      <SubNav current="positions" />

      {data && (
        <Panel title="持仓概览">
          <div className="flex flex-wrap gap-6">
            <Metric label="持仓数" value={String(data.totals.open_count)} />
            <Metric label="已实现盈亏" value={formatPrice(data.totals.realized_pnl)} change={data.totals.realized_pnl} />
          </div>
        </Panel>
      )}

      {portfolioLoading ? (
        <p className="text-sm text-[var(--text-dim)]">加载中…</p>
      ) : portfolioError ? (
        <p className="text-sm text-[var(--down)]">{portfolioError}</p>
      ) : sortedPositions.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--text-dim)]">暂无持仓记录</p>
        </Panel>
      ) : (
        <Panel title={`持仓明细 · ${sortedPositions.length}`}>
          <table className="num w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-dim)]">
                <th className="pb-1 font-normal">标的</th>
                <th className="pb-1 font-normal">股数</th>
                <th className="pb-1 font-normal">成本价</th>
                <th className="pb-1 font-normal">已实现盈亏</th>
                <th className="pb-1 font-normal">币种</th>
                <th className="pb-1 font-normal">建仓日</th>
                <th className="pb-1 font-normal">平仓日</th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map((p) => {
                const isClosed = p.shares === 0 || !!p.closed_at;
                return (
                  <tr
                    key={p.ticker}
                    className={cn('border-t border-[var(--border)]', isClosed && 'text-[var(--text-dim)]')}
                  >
                    <td className="py-1"><Link href={`/stock/${encodeURIComponent(p.ticker)}`} className="text-accent hover:underline">{p.ticker}</Link></td>
                    <td className="py-1">{p.shares}</td>
                    <td className="py-1">{formatPrice(p.avg_cost)}</td>
                    <td className="py-1">{formatPrice(p.realized_pnl)}</td>
                    <td className="py-1">{p.currency}</td>
                    <td className="py-1">{p.opened_at?.slice(0, 10) ?? '--'}</td>
                    <td className="py-1">{p.closed_at?.slice(0, 10) ?? '--'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {tradesLoading ? (
        <p className="text-sm text-[var(--text-dim)]">加载中…</p>
      ) : tradesError ? (
        <p className="text-sm text-[var(--down)]">{tradesError}</p>
      ) : trades.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--text-dim)]">暂无成交记录</p>
        </Panel>
      ) : (
        <Panel title={`成交流水 · ${trades.length}`}>
          <table className="num w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-dim)]">
                <th className="pb-1 font-normal">成交时间</th>
                <th className="pb-1 font-normal">标的</th>
                <th className="pb-1 font-normal">方向</th>
                <th className="pb-1 font-normal">价格</th>
                <th className="pb-1 font-normal">数量</th>
                <th className="pb-1 font-normal">费用</th>
                <th className="pb-1 font-normal">关联决策</th>
                <th className="pb-1 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-t border-[var(--border)]">
                  <td className="py-1">{t.executed_at.slice(0, 10)}</td>
                  <td className="py-1"><Link href={`/stock/${encodeURIComponent(t.ticker)}`} className="text-accent hover:underline">{t.ticker}</Link></td>
                  <td className="py-1">{DIRECTION_LABEL[t.direction]}</td>
                  <td className="py-1">{formatPrice(t.price)}</td>
                  <td className="py-1">{t.quantity}</td>
                  <td className="py-1">{formatPrice(t.fee)}</td>
                  <td className="py-1" title={t.decision_id ?? undefined}>{truncateId(t.decision_id)}</td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      disabled={deletingId !== null}
                      className="text-[var(--down)] hover:underline disabled:opacity-50"
                    >
                      {deletingId === t.id ? '删除中…' : '删除'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {deleteError && <p className="mt-2 text-xs text-[var(--down)]">{deleteError}</p>}
          <p className="mt-2 text-[10px] text-[var(--text-dim)]">录错了？删除该笔成交后在驾驶舱重新录入（可指定成交时间）；持仓由成交流水自动重算。</p>
        </Panel>
      )}
    </div>
  );
}
