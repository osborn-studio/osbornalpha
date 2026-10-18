'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Panel, Metric } from '@/components/ui';
import { usePortfolio } from '@/lib/hooks/usePortfolio';
import { classifyMarket, cn, formatPrice, formatPriceFor } from '@/lib/utils';
import type { Trade } from '@/lib/supabase/database.types';

function SubNav({ current }: { current: 'cockpit' | 'decisions' | 'positions' | 'review' }) {
  const t = useTranslations('portfolio');
  const items: Array<{ key: typeof current; href: string; label: string }> = [
    { key: 'cockpit', href: '/portfolio', label: t('nav.cockpit') },
    { key: 'decisions', href: '/portfolio/decisions', label: t('nav.decisions') },
    { key: 'positions', href: '/portfolio/positions', label: t('nav.positions') },
    { key: 'review', href: '/portfolio/review', label: t('nav.review') },
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

function truncateId(id: string | null): string {
  if (!id) return '--';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export default function PositionsPage() {
  const t = useTranslations('portfolio');
  const DIRECTION_LABEL: Record<Trade['direction'], string> = { buy: t('direction.buy'), sell: t('direction.sell') };
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
        <Panel title={t('positions.overviewTitle')}>
          <div className="flex flex-wrap gap-6">
            <Metric label={t('positions.positionCount')} value={String(data.totals.open_count)} />
            <Metric label={t('positions.realizedPnl')} value={formatPrice(data.totals.realized_pnl)} change={data.totals.realized_pnl} />
          </div>
        </Panel>
      )}

      {portfolioLoading ? (
        <p className="text-sm text-[var(--text-dim)]">{t('positions.loading')}</p>
      ) : portfolioError ? (
        <p className="text-sm text-[var(--down)]">{portfolioError}</p>
      ) : sortedPositions.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--text-dim)]">{t('positions.emptyPositions')}</p>
        </Panel>
      ) : (
        <Panel title={t('positions.positionsTitle', { count: sortedPositions.length })}>
          <table className="num w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-dim)]">
                <th className="pb-1 font-normal">{t('positions.positionColumns.ticker')}</th>
                <th className="pb-1 font-normal">{t('positions.positionColumns.shares')}</th>
                <th className="pb-1 font-normal">{t('positions.positionColumns.avgCost')}</th>
                <th className="pb-1 font-normal">{t('positions.positionColumns.realizedPnl')}</th>
                <th className="pb-1 font-normal">{t('positions.positionColumns.currency')}</th>
                <th className="pb-1 font-normal">{t('positions.positionColumns.openedAt')}</th>
                <th className="pb-1 font-normal">{t('positions.positionColumns.closedAt')}</th>
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
                    <td className="py-1">{formatPriceFor(classifyMarket(p.ticker), p.avg_cost)}</td>
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
        <p className="text-sm text-[var(--text-dim)]">{t('positions.loading')}</p>
      ) : tradesError ? (
        <p className="text-sm text-[var(--down)]">{tradesError}</p>
      ) : trades.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--text-dim)]">{t('positions.emptyTrades')}</p>
        </Panel>
      ) : (
        <Panel title={t('positions.tradesTitle', { count: trades.length })}>
          <table className="num w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-dim)]">
                <th className="pb-1 font-normal">{t('positions.tradeColumns.executedAt')}</th>
                <th className="pb-1 font-normal">{t('positions.tradeColumns.ticker')}</th>
                <th className="pb-1 font-normal">{t('positions.tradeColumns.direction')}</th>
                <th className="pb-1 font-normal">{t('positions.tradeColumns.price')}</th>
                <th className="pb-1 font-normal">{t('positions.tradeColumns.quantity')}</th>
                <th className="pb-1 font-normal">{t('positions.tradeColumns.fee')}</th>
                <th className="pb-1 font-normal">{t('positions.tradeColumns.linkedDecision')}</th>
                <th className="pb-1 font-normal">{t('positions.tradeColumns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((tr) => (
                <tr key={tr.id} className="border-t border-[var(--border)]">
                  <td className="py-1">{tr.executed_at.slice(0, 10)}</td>
                  <td className="py-1"><Link href={`/stock/${encodeURIComponent(tr.ticker)}`} className="text-accent hover:underline">{tr.ticker}</Link></td>
                  <td className="py-1">{DIRECTION_LABEL[tr.direction]}</td>
                  <td className="py-1">{formatPriceFor(classifyMarket(tr.ticker), tr.price)}</td>
                  <td className="py-1">{tr.quantity}</td>
                  <td className="py-1">{formatPrice(tr.fee)}</td>
                  <td className="py-1" title={tr.decision_id ?? undefined}>{truncateId(tr.decision_id)}</td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(tr.id)}
                      disabled={deletingId !== null}
                      className="text-[var(--down)] hover:underline disabled:opacity-50"
                    >
                      {deletingId === tr.id ? t('positions.deleting') : t('positions.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {deleteError && <p className="mt-2 text-xs text-[var(--down)]">{deleteError}</p>}
          <p className="mt-2 text-[10px] text-[var(--text-dim)]">{t('positions.reentryHint')}</p>
        </Panel>
      )}
    </div>
  );
}
